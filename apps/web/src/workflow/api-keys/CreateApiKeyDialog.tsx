import { useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createWorkflowApiKey } from '../../api/apiKeys';
import { queryKeys } from '../../api/queryKeys';

interface CreateApiKeyDialogProps {
  projectId: string;
  workflowId: string;
  onClose: () => void;
}

type CopyState = 'idle' | 'copied' | 'failed';

/**
 * Shows the raw key exactly once. It lives only in this dialog's mutation result, which is
 * dropped when the dialog unmounts; the server cannot show it again because it only has a hash.
 */
export function CreateApiKeyDialog({ projectId, workflowId, onClose }: CreateApiKeyDialogProps) {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [copyState, setCopyState] = useState<CopyState>('idle');

  const createMutation = useMutation({
    mutationFn: (keyName: string) => createWorkflowApiKey(projectId, workflowId, keyName),
    gcTime: 0,
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: queryKeys.apiKeys.list(projectId, workflowId) }),
  });
  const createdKey = createMutation.data?.key ?? null;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (name.trim()) {
      createMutation.mutate(name.trim());
    }
  }

  async function copyKey(key: string) {
    try {
      await navigator.clipboard.writeText(key);
      setCopyState('copied');
    } catch {
      setCopyState('failed');
    }
  }

  // Portaled to <body>: the detail page styles every nested <form> as a card.
  return createPortal(
    <div className="modal-backdrop" role="presentation">
      <div className="modal-card api-key-dialog" role="dialog" aria-modal="true" aria-label="创建 API 密钥">
        {createdKey ? (
          <div className="api-key-dialog-body">
            <h2>API 密钥已创建</h2>
            <p className="api-key-dialog-warning">
              请立即复制并妥善保存。关闭后将无法再次查看；如果丢失，只能撤销后重新创建。
            </p>
            <code className="api-key-secret">{createdKey}</code>
            {copyState === 'failed' && (
              <p className="api-key-dialog-error">复制失败，请手动选中上面的密钥复制。</p>
            )}
            <div className="api-key-dialog-actions">
              <button type="button" className="subtle-button" onClick={() => void copyKey(createdKey)}>
                {copyState === 'copied' ? '已复制' : '复制'}
              </button>
              <button type="button" className="primary-button" onClick={onClose}>
                我已保存，完成
              </button>
            </div>
          </div>
        ) : (
          <form className="api-key-dialog-body" onSubmit={handleSubmit}>
            <h2>创建 API 密钥</h2>
            <label>
              名称
              <input
                autoFocus
                value={name}
                maxLength={100}
                placeholder="例如：Backend Production"
                onChange={(event) => setName(event.target.value)}
              />
              <span className="api-key-dialog-hint">用于在列表中辨认这把密钥的用途。</span>
            </label>
            {createMutation.isError && (
              <p className="api-key-dialog-error">创建失败：{createMutation.error.message}</p>
            )}
            <div className="api-key-dialog-actions">
              <button type="button" className="subtle-button" onClick={onClose}>
                取消
              </button>
              <button
                type="submit"
                className="primary-button"
                disabled={!name.trim() || createMutation.isPending}
              >
                {createMutation.isPending ? '创建中…' : '创建'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>,
    document.body,
  );
}
