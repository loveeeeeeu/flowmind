import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'react-router';
import {
  createMcpConnection,
  deleteMcpConnection,
  getMcpConnections,
  testMcpConnection,
  updateMcpConnection,
  type McpAuthType,
  type McpConnection,
  type SaveMcpConnectionInput,
} from '../../api/mcp';
import { queryKeys } from '../../api/queryKeys';
import { getProjectTools, type ProjectTool } from '../../api/tools';
import { useProjectPermissions } from '../../auth/useProjectPermissions';
import { formatRunTime } from '../../workflow/execution/runUtils';

type DialogState = { mode: 'create' } | { mode: 'edit'; connection: McpConnection } | null;

export function ToolsPage() {
  const { projectId = '' } = useParams();
  const queryClient = useQueryClient();
  const { canEdit } = useProjectPermissions(projectId);
  const [dialog, setDialog] = useState<DialogState>(null);

  const connections = useQuery({
    queryKey: queryKeys.mcpConnections.list(projectId),
    queryFn: () => getMcpConnections(projectId),
    enabled: Boolean(projectId),
  });
  const catalog = useQuery({
    queryKey: queryKeys.tools.catalog(projectId),
    queryFn: () => getProjectTools(projectId),
    enabled: Boolean(projectId),
  });

  async function refresh() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.mcpConnections.list(projectId) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.tools.catalog(projectId) }),
    ]);
  }

  const removeMutation = useMutation({
    mutationFn: (connectionId: string) => deleteMcpConnection(projectId, connectionId),
    onSuccess: refresh,
  });
  const statusMutation = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      updateMcpConnection(projectId, id, { status: enabled ? 'ACTIVE' : 'DISABLED' }),
    onSuccess: refresh,
  });

  function remove(connection: McpConnection) {
    if (window.confirm(`删除 MCP 连接“${connection.name}”？已配置该工具的 Agent 在下次运行时将无法调用它。`)) {
      removeMutation.mutate(connection.id);
    }
  }

  const builtIns = (catalog.data?.tools ?? []).filter((tool) => tool.source === 'BUILT_IN');
  const mcpTools = (catalog.data?.tools ?? []).filter((tool) => tool.source === 'MCP');

  return (
    <main className="workspace-page tools-page">
      <header className="page-title-row">
        <div>
          <p className="page-eyebrow">TOOLS</p>
          <h1>工具</h1>
          <p className="page-subtitle">管理 Agent 可调用的内置工具与 MCP 工具连接。连接成功后，发现到的工具会自动出现在 Agent 节点的工具选择器中。</p>
        </div>
        <button type="button" className="primary-button" disabled={!canEdit} onClick={() => setDialog({ mode: 'create' })}>+ 添加 MCP 连接</button>
      </header>

      {!canEdit && <p className="tools-notice">你拥有只读权限；可以查看工具与连接状态，但不能修改连接。</p>}

      <section className="tools-section" aria-labelledby="available-tools-heading">
        <div className="tools-section-head">
          <div><h2 id="available-tools-heading">可用工具</h2><p>这里是当前项目的实时工具目录，Agent 只能在运行时调用你为节点勾选的工具。</p></div>
          <span className="tools-count">{catalog.data?.tools.length ?? 0} 个工具</span>
        </div>
        {catalog.isPending && <div className="empty-state">正在加载工具目录…</div>}
        {catalog.isError && <div className="error-message">加载工具目录失败：{catalog.error.message}</div>}
        {catalog.isSuccess && <>
          <ToolGroup title="内置工具" tools={builtIns} />
          <ToolGroup title="MCP 工具" tools={mcpTools} empty="还没有发现 MCP 工具。添加并测试一个启用的 MCP 连接后，它的工具会显示在这里。" />
          {catalog.data.warnings.map((warning, index) => <p className="tools-warning" key={`${warning.message}-${index}`}>部分 MCP 服务暂时不可用：{warning.message}</p>)}
        </>}
      </section>

      <section className="tools-section" aria-labelledby="mcp-connections-heading">
        <div className="tools-section-head">
          <div><h2 id="mcp-connections-heading">MCP 连接</h2><p>仅支持公开 HTTPS 的 Streamable HTTP MCP 服务。Bearer Token 会加密保存，页面不会回显。</p></div>
        </div>
        {connections.isPending && <div className="empty-state">正在加载 MCP 连接…</div>}
        {connections.isError && <div className="error-message">加载 MCP 连接失败：{connections.error.message}</div>}
        {connections.isSuccess && connections.data.length === 0 && <div className="empty-state">还没有 MCP 连接。连接一个外部 MCP 服务，为 Agent 增加可发现工具。</div>}
        {connections.isSuccess && connections.data.length > 0 && <ul className="mcp-connection-list">
          {connections.data.map((connection) => <McpConnectionCard
            key={connection.id}
            connection={connection}
            projectId={projectId}
            canEdit={canEdit}
            changing={statusMutation.isPending && statusMutation.variables?.id === connection.id}
            removing={removeMutation.isPending && removeMutation.variables === connection.id}
            onEdit={() => setDialog({ mode: 'edit', connection })}
            onToggle={() => statusMutation.mutate({ id: connection.id, enabled: connection.status !== 'ACTIVE' })}
            onDelete={() => remove(connection)}
          />)}
        </ul>}
        {(removeMutation.isError || statusMutation.isError) && <div className="error-message">操作失败：{(removeMutation.error ?? statusMutation.error)?.message}</div>}
      </section>

      {dialog && <McpConnectionDialog
        projectId={projectId}
        connection={dialog.mode === 'edit' ? dialog.connection : undefined}
        onClose={() => setDialog(null)}
        onSaved={refresh}
      />}
    </main>
  );
}

function ToolGroup({ title, tools, empty }: { title: string; tools: ProjectTool[]; empty?: string }) {
  return <div className="tool-group">
    <h3>{title}<span>{tools.length}</span></h3>
    {tools.length === 0 ? <p className="tool-group-empty">{empty ?? '暂无工具。'}</p> : <div className="tool-catalog-grid">
      {tools.map((tool) => <article className="tool-catalog-card" key={tool.name} title={tool.displayName}>
        <div className="tool-catalog-card-head"><strong>{displayToolName(tool)}</strong><span className={tool.source === 'MCP' ? 'tool-source mcp' : 'tool-source'}>{tool.source === 'MCP' ? 'MCP' : '内置'}</span></div>
        <p>{shortDescription(tool.description)}</p>
      </article>)}
    </div>}
  </div>;
}

function displayToolName(tool: ProjectTool) {
  if (tool.source !== 'MCP') return tool.displayName;
  const rawName = tool.name.split('__').at(-1) ?? tool.displayName;
  return rawName.replaceAll('_', ' ');
}

function shortDescription(description: string) {
  return description.replace(/\s+/g, ' ').trim();
}

function McpConnectionCard({ connection, projectId, canEdit, changing, removing, onEdit, onToggle, onDelete }: {
  connection: McpConnection; projectId: string; canEdit: boolean; changing: boolean; removing: boolean;
  onEdit: () => void; onToggle: () => void; onDelete: () => void;
}) {
  const test = useMutation({ mutationFn: () => testMcpConnection(projectId, connection.id) });
  const active = connection.status === 'ACTIVE';
  return <li className={`mcp-connection-card ${active ? '' : 'disabled'}`}>
    <div className="mcp-connection-main">
      <div className="mcp-connection-title"><strong>{connection.name}</strong><span className={active ? 'connection-status active' : 'connection-status'}>{active ? '已启用' : '已停用'}</span></div>
      <dl className="mcp-connection-fields">
        <dt>端点</dt><dd className="mono" title={connection.url}>{connection.url}</dd>
        <dt>传输</dt><dd>Streamable HTTP</dd>
        <dt>认证</dt><dd>{connection.authType === 'BEARER' ? `Bearer Token${connection.hasSecret ? ' · 已配置' : ''}` : '无需认证'}</dd>
      </dl>
      {test.isPending && <p className="connection-test-result">正在发现 MCP 工具…</p>}
      {test.isSuccess && <p className="connection-test-result success">连接成功，发现 {test.data.toolCount} 个工具。</p>}
      {test.isError && <p className="connection-test-result error">测试失败：{test.error.message}</p>}
    </div>
    <div className="mcp-connection-side">
      <span>更新于 {formatRunTime(connection.updatedAt)}</span>
      <div className="mcp-connection-actions">
        <button type="button" className="subtle-button" disabled={!canEdit || !active || test.isPending} onClick={() => test.mutate()}>{test.isPending ? '测试中…' : '测试连接'}</button>
        <button type="button" className="subtle-button" disabled={!canEdit} onClick={onEdit}>编辑</button>
        <button type="button" className="subtle-button" disabled={!canEdit || changing} onClick={onToggle}>{changing ? '保存中…' : active ? '停用' : '启用'}</button>
        <button type="button" className="subtle-button danger" disabled={!canEdit || removing} onClick={onDelete}>{removing ? '删除中…' : '删除'}</button>
      </div>
    </div>
  </li>;
}

function McpConnectionDialog({ projectId, connection, onClose, onSaved }: { projectId: string; connection?: McpConnection; onClose: () => void; onSaved: () => Promise<void> }) {
  const [name, setName] = useState(connection?.name ?? '');
  const [url, setUrl] = useState(connection?.url ?? '');
  const [authType, setAuthType] = useState<McpAuthType>(connection?.authType ?? 'NONE');
  const [secret, setSecret] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: (input: SaveMcpConnectionInput) => connection
      ? updateMcpConnection(projectId, connection.id, input)
      : createMcpConnection(projectId, input),
    onSuccess: async () => { await onSaved(); onClose(); },
  });
  const needsSecret = authType === 'BEARER' && (!connection || connection.authType !== 'BEARER' || !connection.hasSecret);

  function submit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);
    if (needsSecret && !secret.trim()) { setFormError('Bearer 认证需要填写 Token。'); return; }
    save.mutate({ name: name.trim(), url: url.trim(), authType, ...(secret.trim() ? { secret: secret.trim() } : {}) });
  }

  return <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
    <form className="modal-card settings-dialog" onSubmit={submit} onMouseDown={(event) => event.stopPropagation()}>
      <div className="settings-dialog-body">
        <h2>{connection ? '编辑 MCP 连接' : '添加 MCP 连接'}</h2>
        <p className="settings-dialog-context">FlowMind 会校验端点必须为公共 HTTPS 地址，以避免连接到内网资源。</p>
        <label>连接名称<input value={name} maxLength={100} required placeholder="例如：公司内部工具" onChange={(event) => setName(event.target.value)} /></label>
        <label>MCP Server URL<input value={url} type="url" required placeholder="https://mcp.example.com/mcp" onChange={(event) => setUrl(event.target.value)} /><span className="settings-dialog-hint">仅支持 Streamable HTTP MCP 端点。</span></label>
        <label>认证方式<select value={authType} onChange={(event) => setAuthType(event.target.value as McpAuthType)}><option value="NONE">无需认证</option><option value="BEARER">Bearer Token</option></select></label>
        {authType === 'BEARER' && <label>Bearer Token<input type="password" value={secret} required={needsSecret} placeholder={connection?.hasSecret ? '留空则保持当前 Token' : '粘贴 Token'} onChange={(event) => setSecret(event.target.value)} /><span className="settings-dialog-hint">Token 会被加密保存，之后不会在页面回显。</span></label>}
        {(formError || save.error) && <p className="settings-dialog-error">{formError ?? save.error?.message}</p>}
        <div className="settings-dialog-actions"><button type="button" className="subtle-button" disabled={save.isPending} onClick={onClose}>取消</button><button type="submit" className="primary-button" disabled={save.isPending}>{save.isPending ? '保存中…' : connection ? '保存修改' : '添加连接'}</button></div>
      </div>
    </form>
  </div>;
}
