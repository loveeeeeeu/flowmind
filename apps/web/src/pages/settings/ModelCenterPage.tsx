import { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getCredentials } from '../../api/credentials';
import { disableModel, getCredentialModels, updateModel } from '../../api/models';
import { queryKeys } from '../../api/queryKeys';
import { SettingsTabs } from '../../settings/SettingsTabs';
import { getProviderOption } from '../../settings/credentials/providers';
import { ImportModelsDialog } from '../../settings/models/ImportModelsDialog';
import { ModelFormDialog } from '../../settings/models/ModelFormDialog';
import { formatContextWindow } from '../../settings/models/modelFormat';
import type { Credential } from '../../types/credential';
import type { Model } from '../../types/model';
import { useProjectPermissions } from '../../auth/useProjectPermissions';

type DialogState = { mode: 'create' } | { mode: 'import' } | { mode: 'edit'; model: Model } | null;

export function ModelCenterPage() {
  const { projectId = '' } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const { canEdit } = useProjectPermissions(projectId);

  const credentialsQuery = useQuery({
    queryKey: queryKeys.credentials.list(projectId),
    queryFn: () => getCredentials(projectId),
  });

  const credentials = credentialsQuery.data ?? [];
  const selected =
    credentials.find((credential) => credential.id === searchParams.get('credential')) ??
    credentials.find((credential) => !credential.revokedAt) ??
    credentials[0];

  return (
    <main className="workspace-page model-center-page">
      <SettingsTabs />
      <header className="page-title-row">
        <div>
          <p className="page-eyebrow">SETTINGS</p>
          <h1>模型中心</h1>
          <div className="page-subtitle">
            为每个凭证登记可调用的模型。LLM 节点只会从这里选择模型；停用的模型不再出现在新节点的选择中，已发布的版本仍可继续运行。
          </div>
        </div>
      </header>

      {credentialsQuery.isPending && <div className="empty-state">正在加载凭证…</div>}
      {credentialsQuery.isError && (
        <div className="error-message">加载凭证失败：{credentialsQuery.error.message}</div>
      )}
      {credentialsQuery.isSuccess && credentials.length === 0 && (
        <div className="empty-state">
          模型需要挂在凭证下。先去<Link to="/settings/credentials">模型凭证</Link>添加一个供应商的 API Key。
        </div>
      )}

      {selected && (
        <div className="model-center">
          <ul className="model-center-credentials" aria-label="凭证">
            {credentials.map((credential) => (
              <li key={credential.id}>
                <button
                  type="button"
                  className={`model-center-credential ${credential.id === selected.id ? 'active' : ''} ${credential.revokedAt ? 'revoked' : ''}`}
                  onClick={() => setSearchParams({ credential: credential.id }, { replace: true })}
                >
                  <span className="model-center-credential-name">{credential.name}</span>
                  <span className="model-center-credential-meta">
                    {getProviderOption(credential.provider).label}
                    {credential.revokedAt ? ' · 已撤销' : ''}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <CredentialModels key={selected.id} projectId={projectId} credential={selected} canEdit={canEdit} />
        </div>
      )}
    </main>
  );
}

function CredentialModels({ projectId, credential, canEdit }: { projectId: string; credential: Credential; canEdit: boolean }) {
  const queryClient = useQueryClient();
  const [dialog, setDialog] = useState<DialogState>(null);
  const revoked = credential.revokedAt !== null;

  const modelsQuery = useQuery({
    queryKey: queryKeys.models.byCredential(projectId, credential.id),
    queryFn: () => getCredentialModels(projectId, credential.id),
  });

  const toggleMutation = useMutation({
    mutationFn: (model: Model) =>
      model.enabled ? disableModel(projectId, model.id) : updateModel(projectId, model.id, { enabled: true }).then(() => undefined),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.models.all(projectId) }),
  });

  function toggle(model: Model) {
    if (
      !model.enabled ||
      window.confirm(
        `停用「${model.name}」后，新配置的 LLM 节点将无法选择它；已发布的版本如果用到它，仍会继续运行。确定停用吗？`,
      )
    ) {
      toggleMutation.mutate(model);
    }
  }

  return (
    <section className="model-center-panel">
      <header className="model-center-panel-head">
        <div className="model-center-panel-title">
          <div className="credential-card-head">
            <span className="credential-name">{credential.name}</span>
            <span className="credential-provider">{getProviderOption(credential.provider).label}</span>
            {revoked && <span className="credential-revoked-tag">已撤销</span>}
          </div>
          <span className={`model-center-base-url ${credential.baseUrl ? 'mono' : ''}`}>
            {credential.baseUrl ?? '官方地址'}
          </span>
        </div>
        <div className="model-center-panel-actions">
          <button
            type="button"
            className="subtle-button"
            disabled={!canEdit || revoked}
            onClick={() => setDialog({ mode: 'import' })}
          >
            从供应商导入
          </button>
          <button
            type="button"
            className="primary-button"
            disabled={!canEdit || revoked}
            onClick={() => setDialog({ mode: 'create' })}
          >
            添加模型
          </button>
        </div>
      </header>

      {revoked && (
        <p className="model-center-revoked">
          该凭证已撤销：下面的模型不会出现在节点的模型选择中，使用它们的工作流运行时会失败。
        </p>
      )}

      {modelsQuery.isPending && <div className="empty-state">正在加载模型…</div>}
      {modelsQuery.isError && <div className="error-message">加载模型失败：{modelsQuery.error.message}</div>}
      {toggleMutation.isError && (
        <div className="error-message">操作失败：{toggleMutation.error.message}</div>
      )}
      {modelsQuery.isSuccess && modelsQuery.data.length === 0 && (
        <div className="empty-state">
          {revoked
            ? '这个凭证下没有模型。'
            : '还没有模型。可以从供应商导入，或手动添加一个这个凭证能调用的模型，例如 gpt-4.1-mini。'}
        </div>
      )}

      {modelsQuery.isSuccess && modelsQuery.data.length > 0 && (
        <table className="model-table">
          <thead>
            <tr>
              <th>名称</th>
              <th>模型标识</th>
              <th>类型</th>
              <th>上下文</th>
              <th>Temperature</th>
              <th>状态</th>
              <th aria-label="操作" />
            </tr>
          </thead>
          <tbody>
            {modelsQuery.data.map((model) => {
              const toggling = toggleMutation.isPending && toggleMutation.variables.id === model.id;

              return (
                <tr key={model.id} className={model.enabled ? '' : 'disabled'}>
                  <td className="model-table-name">{model.name}</td>
                  <td className="mono">{model.modelName}</td>
                  <td>对话</td>
                  <td>{formatContextWindow(model.contextWindow)}</td>
                  <td>{model.supportsTemperature ? '支持' : '不支持'}</td>
                  <td>
                    <span className={`model-status ${model.enabled ? 'enabled' : ''}`}>
                      {model.enabled ? '已启用' : '已停用'}
                    </span>
                  </td>
                  <td>
                    <div className="credential-actions">
                      <button
                        type="button"
                        className="subtle-button"
                        disabled={!canEdit}
                        onClick={() => setDialog({ mode: 'edit', model })}
                      >
                        编辑
                      </button>
                      <button
                        type="button"
                        className={`subtle-button ${model.enabled ? 'credential-revoke' : ''}`}
                        disabled={!canEdit || toggling}
                        onClick={() => toggle(model)}
                      >
                        {toggling ? '处理中…' : model.enabled ? '停用' : '启用'}
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {dialog?.mode === 'import' && (
        <ImportModelsDialog projectId={projectId} credential={credential} onClose={() => setDialog(null)} />
      )}
      {(dialog?.mode === 'create' || dialog?.mode === 'edit') && (
        <ModelFormDialog
          projectId={projectId}
          credential={credential}
          model={dialog.mode === 'edit' ? dialog.model : undefined}
          onClose={() => setDialog(null)}
        />
      )}
    </section>
  );
}
