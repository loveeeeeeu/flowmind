import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getWorkflowApiKeys, revokeWorkflowApiKey } from '../../api/apiKeys';
import { API_BASE_URL } from '../../api/client';
import { queryKeys } from '../../api/queryKeys';
import type { WorkflowApiKey } from '../../types/apiKey';
import { formatRunTime } from '../execution/runUtils';
import { CreateApiKeyDialog } from './CreateApiKeyDialog';

interface ApiKeyListProps {
  projectId: string;
  workflowId: string;
  hasPublishedVersion: boolean;
}

export function ApiKeyList({ projectId, workflowId, hasPublishedVersion }: ApiKeyListProps) {
  const queryClient = useQueryClient();
  const [isCreating, setIsCreating] = useState(false);

  const keysQuery = useQuery({
    queryKey: queryKeys.apiKeys.list(projectId, workflowId),
    queryFn: () => getWorkflowApiKeys(projectId, workflowId),
  });

  const revokeMutation = useMutation({
    mutationFn: (keyId: string) => revokeWorkflowApiKey(projectId, workflowId, keyId),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: queryKeys.apiKeys.list(projectId, workflowId) }),
  });

  function revoke(apiKey: WorkflowApiKey) {
    if (
      window.confirm(`撤销「${apiKey.name}」后，使用它的外部调用会立即被拒绝，且无法恢复。确定撤销吗？`)
    ) {
      revokeMutation.mutate(apiKey.id);
    }
  }

  return (
    <section className="api-key-section">
      <div className="api-key-section-head">
        <div>
          <h2>API 密钥</h2>
          <p className="api-key-section-desc">
            外部系统用 API 密钥调用此工作流的最新发布版本；草稿不会被外部调用执行。
          </p>
        </div>
        <button type="button" className="primary-button" onClick={() => setIsCreating(true)}>
          创建密钥
        </button>
      </div>

      <div className="api-key-endpoint">
        <code>POST {API_BASE_URL}/api/v1/workflows/{workflowId}/runs</code>
        <code>Authorization: Bearer &lt;API 密钥&gt;</code>
      </div>

      {!hasPublishedVersion && (
        <p className="api-key-unpublished">工作流尚未发布，外部调用会返回 400。请先在编排器中发布。</p>
      )}

      {keysQuery.isPending && <p className="execution-empty">正在加载 API 密钥…</p>}
      {keysQuery.isError && (
        <div className="error-message">加载 API 密钥失败：{keysQuery.error.message}</div>
      )}
      {keysQuery.isSuccess && keysQuery.data.length === 0 && (
        <p className="execution-empty">还没有 API 密钥。</p>
      )}

      {keysQuery.isSuccess && keysQuery.data.length > 0 && (
        <ul className="api-key-list">
          {keysQuery.data.map((apiKey) => {
            const revoking = revokeMutation.isPending && revokeMutation.variables === apiKey.id;

            return (
              <li key={apiKey.id} className={`api-key-item ${apiKey.revokedAt ? 'revoked' : ''}`}>
                <div className="api-key-main">
                  <span className="api-key-name">{apiKey.name}</span>
                  {apiKey.revokedAt && <span className="api-key-revoked-tag">已撤销</span>}
                  <code className="api-key-prefix">fm_{apiKey.prefix}_••••</code>
                </div>
                <span className="api-key-meta">
                  创建于 {formatRunTime(apiKey.createdAt)} ·{' '}
                  {apiKey.lastUsedAt ? `最近使用 ${formatRunTime(apiKey.lastUsedAt)}` : '从未使用'}
                  {apiKey.revokedAt && ` · 撤销于 ${formatRunTime(apiKey.revokedAt)}`}
                </span>
                {!apiKey.revokedAt && (
                  <button
                    type="button"
                    className="subtle-button api-key-revoke"
                    disabled={revoking}
                    onClick={() => revoke(apiKey)}
                  >
                    {revoking ? '撤销中…' : '撤销'}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {revokeMutation.isError && (
        <div className="error-message">撤销失败：{revokeMutation.error.message}</div>
      )}

      {isCreating && (
        <CreateApiKeyDialog projectId={projectId} workflowId={workflowId} onClose={() => setIsCreating(false)} />
      )}
    </section>
  );
}
