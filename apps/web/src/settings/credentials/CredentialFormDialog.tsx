import { useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createCredential, updateCredential } from '../../api/credentials';
import { queryKeys } from '../../api/queryKeys';
import type { Credential, CredentialProvider } from '../../types/credential';
import { CREDENTIAL_PROVIDERS, getProviderOption } from './providers';

interface CredentialFormDialogProps {
  projectId: string;
  /** Edit this credential; create a new one when absent. */
  credential?: Credential;
  onClose: () => void;
}

/**
 * The secret input always starts empty: the API never returns a secret, so editing can only
 * replace it. gcTime 0 drops the mutation (and the submitted secret) as soon as the dialog closes.
 */
export function CredentialFormDialog({ projectId, credential, onClose }: CredentialFormDialogProps) {
  const queryClient = useQueryClient();
  const isEdit = credential !== undefined;
  const [name, setName] = useState(credential?.name ?? '');
  const [provider, setProvider] = useState<CredentialProvider>(credential?.provider ?? 'OPENAI');
  const [baseUrl, setBaseUrl] = useState(credential?.baseUrl ?? '');
  const [secret, setSecret] = useState('');

  const providerOption = getProviderOption(provider);
  const baseUrlRequired = providerOption.officialBaseUrl === null;

  const saveMutation = useMutation({
    mutationFn: () => {
      const trimmedBaseUrl = baseUrl.trim() || null;

      return isEdit
        ? updateCredential(projectId, credential.id, {
            name: name.trim(),
            baseUrl: trimmedBaseUrl,
            ...(secret.trim() ? { secret: secret.trim() } : {}),
          })
        : createCredential(projectId, { name: name.trim(), provider, baseUrl: trimmedBaseUrl, secret: secret.trim() });
    },
    gcTime: 0,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.credentials.list(projectId) });
      onClose();
    },
  });

  const canSubmit =
    name.trim() !== '' &&
    (isEdit || secret.trim() !== '') &&
    (!baseUrlRequired || baseUrl.trim() !== '') &&
    !saveMutation.isPending;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (canSubmit) {
      saveMutation.mutate();
    }
  }

  return createPortal(
    <div className="modal-backdrop" role="presentation">
      <div
        className="modal-card settings-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={isEdit ? '编辑凭证' : '添加凭证'}
      >
        <form className="settings-dialog-body" onSubmit={handleSubmit}>
          <h2>{isEdit ? '编辑凭证' : '添加凭证'}</h2>

          <label>
            名称
            <input
              autoFocus
              value={name}
              maxLength={100}
              placeholder="例如：OpenAI Production"
              onChange={(event) => setName(event.target.value)}
            />
          </label>

          <label>
            模型供应商
            <select
              value={provider}
              disabled={isEdit}
              onChange={(event) => setProvider(event.target.value as CredentialProvider)}
            >
              {CREDENTIAL_PROVIDERS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            {isEdit && <span className="settings-dialog-hint">供应商创建后不可修改；需要更换请新建凭证。</span>}
          </label>

          <label>
            Base URL{baseUrlRequired ? '' : '（可选）'}
            <input
              value={baseUrl}
              maxLength={500}
              placeholder={providerOption.officialBaseUrl ?? 'http://localhost:8000/v1'}
              spellCheck={false}
              onChange={(event) => setBaseUrl(event.target.value)}
            />
            <span className="settings-dialog-hint">
              {baseUrlRequired
                ? '自建或第三方的 OpenAI 兼容接口地址，例如 vLLM、Ollama。'
                : '留空使用官方地址；使用代理或中转服务时再填写。'}
            </span>
          </label>

          <label>
            API Key
            <input
              type="password"
              value={secret}
              maxLength={4096}
              autoComplete="new-password"
              spellCheck={false}
              placeholder={isEdit ? '留空则保留当前密钥' : 'sk-…'}
              onChange={(event) => setSecret(event.target.value)}
            />
            <span className="settings-dialog-hint">
              加密后保存，保存后任何人（包括你自己）都无法在页面上再次查看原文。
            </span>
          </label>

          {saveMutation.isError && (
            <p className="settings-dialog-error">保存失败：{saveMutation.error.message}</p>
          )}

          <div className="settings-dialog-actions">
            <button type="button" className="subtle-button" onClick={onClose}>
              取消
            </button>
            <button type="submit" className="primary-button" disabled={!canSubmit}>
              {saveMutation.isPending ? '保存中…' : isEdit ? '保存' : '添加'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}
