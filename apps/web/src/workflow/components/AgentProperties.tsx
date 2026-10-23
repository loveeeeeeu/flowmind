import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router';
import { getAvailableModels } from '../../api/models';
import { getProjectTools } from '../../api/tools';
import { queryKeys } from '../../api/queryKeys';
import type { AgentNodeData, AgentNodeType } from '../types/workflowCanvas';
import { Field } from './PanelField';

export function AgentProperties({
  node,
  onNodeDataChange,
}: {
  node: AgentNodeType;
  onNodeDataChange: (nodeId: string, patch: Partial<AgentNodeData>) => void;
}) {
  const { projectId = '' } = useParams();
  const models = useQuery({
    queryKey: queryKeys.models.available(projectId),
    queryFn: () => getAvailableModels(projectId),
    enabled: Boolean(projectId),
  });
  const tools = useQuery({
    queryKey: queryKeys.tools.catalog(projectId),
    queryFn: () => getProjectTools(projectId),
    enabled: Boolean(projectId),
  });
  const usableModels = (models.data ?? []).filter((model) => model.supportsToolCalling);
  const selectedTools = node.data.toolNames ?? [];

  return <>
    <Field label="模型">
      <select value={node.data.modelId} onChange={(event) => onNodeDataChange(node.id, { modelId: event.target.value })}>
        <option value="" disabled>选择支持 Tool Calling 的聊天模型</option>
        {usableModels.map((model) => <option key={model.id} value={model.id}>{model.credential.name} · {model.name}</option>)}
      </select>
    </Field>
    {models.isSuccess && usableModels.length === 0 && <p className="panel-notice warning">没有启用且支持 Tool Calling 的 CHAT 模型；请在模型中心开启此能力。</p>}
    <Field label="系统提示词"><textarea rows={4} value={node.data.systemPrompt ?? ''} onChange={(event) => onNodeDataChange(node.id, { systemPrompt: event.target.value })} /></Field>
    <Field label="用户提示词"><textarea rows={8} value={node.data.prompt ?? ''} placeholder="例如：{{question}}" onChange={(event) => onNodeDataChange(node.id, { prompt: event.target.value })} /></Field>
    <Field label="允许的工具（最多 20 个）">
      <div className="agent-tool-list">
        {(tools.data?.tools ?? []).map((tool) => <label key={tool.name}>
          <input
            type="checkbox"
            checked={selectedTools.includes(tool.name)}
            onChange={(event) => {
              const next = event.target.checked ? [...selectedTools, tool.name] : selectedTools.filter((name) => name !== tool.name);
              if (next.length <= 20) onNodeDataChange(node.id, { toolNames: next });
            }}
          />
          <strong>{tool.source === 'MCP' ? (tool.name.split('__').at(-1) ?? tool.displayName).replaceAll('_', ' ') : tool.displayName}</strong><small>{tool.source === 'MCP' ? 'MCP' : 'Built-in'} · {tool.description.replace(/\s+/g, ' ').trim()}</small>
        </label>)}
      </div>
    </Field>
    {tools.data?.warnings.length ? <p className="panel-notice warning">部分 MCP 工具暂不可用，未显示。</p> : null}
    <Field label="温度（0 ~ 2）"><input type="number" min={0} max={2} step={0.1} value={node.data.temperature ?? ''} onChange={(event) => onNodeDataChange(node.id, { temperature: event.target.value === '' ? undefined : Number(event.target.value) })} /></Field>
    <Field label="最大步骤（1 ~ 10）">
      <input type="number" min={1} max={10} step={1} value={node.data.maxSteps ?? 5} onChange={(event) => onNodeDataChange(node.id, { maxSteps: Math.max(1, Math.min(10, Number(event.target.value) || 1)) })} />
      <small>一次模型决策算一步；最后一步必须产出最终回答。</small>
    </Field>
    <Field label="输出变量"><input value={node.data.outputVariable ?? ''} placeholder="answer" onChange={(event) => onNodeDataChange(node.id, { outputVariable: event.target.value })} /></Field>
  </>;
}
