import { useState } from 'react';
import { Link } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getCredentials, revokeCredential } from '../../api/credentials';
import { queryKeys } from '../../api/queryKeys';
import { SettingsTabs } from '../../settings/SettingsTabs';
import { CredentialFormDialog } from '../../settings/credentials/CredentialFormDialog';
import { getProviderOption } from '../../settings/credentials/providers';
import type { Credential } from '../../types/credential';
import { formatRunTime } from '../../workflow/execution/runUtils';

type DialogState = { mode: 'create' } | { mode: 'edit'; credential: Credential } | null;

export function CredentialsPage() {
  const queryClient = useQueryClient();
  const [dialog, setDialog] = useState<DialogState>(null);

  const credentialsQuery = useQuery({
    queryKey: queryKeys.credentials.list,
    queryFn: getCredentials,
  });

  const revokeMutation = useMutation({
    mutationFn: revokeCredential,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.credentials.list });
      // A revoked credential's models drop out of /models/available.
      await queryClient.invalidateQueries({ queryKey: queryKeys.models.all });
    },
  });

  function revoke(credential: Credential) {
    if (
      window.confirm(
        `撤销「${credential.name}」后无法恢复。已发布的工作流如果使用了这个凭证，之后的运行都会失败。确定撤销吗？`,
      )
    ) {
      revokeMutation.mutate(credential.id);
    }
  }

  return (
    <main className="workspace-page credentials-page">
      <SettingsTabs />
      <header className="page-title-row">
        <div>
          <p className="page-eyebrow">SETTINGS</p>
          <h1>模型凭证</h1>
          <div className="page-subtitle">
            连接模型供应商所需的 API Key。密钥加密存储，工作流只引用凭证，不会包含密钥本身。
          </div>
        </div>
        <button type="button" className="primary-button" onClick={() => setDialog({ mode: 'create' })}>
          添加凭证
        </button>
      </header>

      <p className="credentials-notice">
        LLM 节点暂时仍使用服务器环境变量中配置的模型；接入凭证会在后续版本完成。
      </p>

      {credentialsQuery.isPending && <div className="empty-state">正在加载凭证…</div>}
      {credentialsQuery.isError && (
        <div className="error-message">加载凭证失败：{credentialsQuery.error.message}</div>
      )}
      {credentialsQuery.isSuccess && credentialsQuery.data.length === 0 && (
        <div className="empty-state">还没有凭证。添加 OpenAI、DeepSeek 或 OpenAI 兼容服务的 API Key 开始吧。</div>
      )}
      {revokeMutation.isError && (
        <div className="error-message">撤销失败：{revokeMutation.error.message}</div>
      )}

      {credentialsQuery.isSuccess && credentialsQuery.data.length > 0 && (
        <ul className="credential-grid">
          {credentialsQuery.data.map((credential) => {
            const provider = getProviderOption(credential.provider);
            const revoking = revokeMutation.isPending && revokeMutation.variables === credential.id;

            return (
              <li key={credential.id} className={`credential-card ${credential.revokedAt ? 'revoked' : ''}`}>
                <div className="credential-card-head">
                  <span className="credential-name">{credential.name}</span>
                  <span className="credential-provider">{provider.label}</span>
                  {credential.revokedAt && <span className="credential-revoked-tag">已撤销</span>}
                </div>
                <dl className="credential-fields">
                  <dt>Base URL</dt>
                  <dd className={credential.baseUrl ? 'mono' : ''}>{credential.baseUrl ?? '官方地址'}</dd>
                  <dt>API Key</dt>
                  <dd className="mono">••••••••••••</dd>
                </dl>
                <div className="credential-card-foot">
                  <span className="credential-meta">
                    {credential.revokedAt
                      ? `撤销于 ${formatRunTime(credential.revokedAt)}`
                      : `更新于 ${formatRunTime(credential.updatedAt)}`}
                  </span>
                  <div className="credential-actions">
                    <Link className="subtle-button" to={`/settings/models?credential=${credential.id}`}>
                      管理模型
                    </Link>
                    {!credential.revokedAt && (
                      <>
                        <button
                          type="button"
                          className="subtle-button"
                          onClick={() => setDialog({ mode: 'edit', credential })}
                        >
                          编辑
                        </button>
                        <button
                          type="button"
                          className="subtle-button credential-revoke"
                          disabled={revoking}
                          onClick={() => revoke(credential)}
                        >
                          {revoking ? '撤销中…' : '撤销'}
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {dialog && (
        <CredentialFormDialog
          credential={dialog.mode === 'edit' ? dialog.credential : undefined}
          onClose={() => setDialog(null)}
        />
      )}
    </main>
  );
}
