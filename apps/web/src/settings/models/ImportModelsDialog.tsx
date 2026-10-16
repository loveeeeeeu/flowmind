import { useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiRequestError } from '../../api/client';
import { getRemoteModels } from '../../api/credentials';
import { importModels } from '../../api/models';
import { queryKeys } from '../../api/queryKeys';
import { describeProviderError } from '../credentials/providerErrors';
import type { Credential } from '../../types/credential';
import { parseContextWindow } from './modelFormat';

interface ImportModelsDialogProps {
  projectId: string;
  credential: Credential;
  onClose: () => void;
}

/** Metadata the provider does not report; the user confirms it per selected model. */
interface ImportDraft {
  name: string;
  contextWindow: string;
  supportsTemperature: boolean;
}

const SEARCH_THRESHOLD = 8;

function importErrorText(error: Error) {
  if (error instanceof ApiRequestError && error.code === 'REMOTE_MODEL_NOT_FOUND') {
    return '所选模型已不在供应商的模型列表中，请重新获取列表后再选。';
  }

  if (error instanceof ApiRequestError && error.code === 'MODEL_NAME_CONFLICT') {
    return '部分模型已经存在于这个凭证下，请重新获取列表。';
  }

  return `导入失败：${describeProviderError(error)}`;
}

/**
 * Discover -> select -> confirm metadata -> import. Fetching the list writes nothing; the server
 * re-checks every selected id against the provider before creating models.
 */
export function ImportModelsDialog({ projectId, credential, onClose }: ImportModelsDialogProps) {
  const queryClient = useQueryClient();
  const [drafts, setDrafts] = useState<Record<string, ImportDraft>>({});
  const [search, setSearch] = useState('');

  const remoteQuery = useQuery({
    queryKey: queryKeys.credentials.remoteModels(projectId, credential.id),
    queryFn: () => getRemoteModels(projectId, credential.id),
    retry: false,
    gcTime: 0,
    refetchOnWindowFocus: false,
  });

  const importMutation = useMutation({
    mutationFn: () =>
      importModels(
        projectId,
        credential.id,
        Object.entries(drafts).map(([modelName, draft]) => {
          const contextWindow = parseContextWindow(draft.contextWindow);

          return {
            modelName,
            name: draft.name.trim(),
            ...(contextWindow ? { contextWindow } : {}),
            supportsTemperature: draft.supportsTemperature,
          };
        }),
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.models.all(projectId) });
      onClose();
    },
  });

  const remoteModels = remoteQuery.data ?? [];
  const keyword = search.trim().toLowerCase();
  const visible = keyword ? remoteModels.filter((model) => model.id.toLowerCase().includes(keyword)) : remoteModels;
  const importedCount = remoteModels.filter((model) => model.imported).length;
  const selected = Object.values(drafts);
  const canImport =
    selected.length > 0 &&
    selected.every((draft) => draft.name.trim() !== '' && parseContextWindow(draft.contextWindow) !== undefined) &&
    !importMutation.isPending;

  function toggle(id: string) {
    setDrafts((current) => {
      const next = { ...current };

      if (next[id]) {
        delete next[id];
      } else {
        next[id] = { name: id, contextWindow: '', supportsTemperature: true };
      }

      return next;
    });
  }

  function updateDraft(id: string, patch: Partial<ImportDraft>) {
    setDrafts((current) => ({ ...current, [id]: { ...current[id], ...patch } }));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (canImport) {
      importMutation.mutate();
    }
  }

  return createPortal(
    <div className="modal-backdrop" role="presentation">
      <div className="modal-card settings-dialog import-models-dialog" role="dialog" aria-modal="true" aria-label="从供应商导入模型">
        <form className="settings-dialog-body" onSubmit={handleSubmit}>
          <h2>从供应商导入模型</h2>
          <p className="settings-dialog-context">凭证：{credential.name}</p>

          {remoteQuery.isPending && <div className="empty-state">正在从供应商获取模型列表…</div>}

          {remoteQuery.isError && (
            <div className="panel-notice danger">
              <span>获取模型列表失败：{describeProviderError(remoteQuery.error)}</span>
              <span>也可以关闭后用「添加模型」手动填写模型标识。</span>
            </div>
          )}

          {remoteQuery.isSuccess && remoteModels.length === 0 && (
            <div className="panel-notice">供应商没有返回任何模型。可以关闭后用「添加模型」手动填写模型标识。</div>
          )}

          {remoteQuery.isSuccess && remoteModels.length > 0 && (
            <>
              <div className="import-models-toolbar">
                <span>
                  共 {remoteModels.length} 个模型，已导入 {importedCount} 个
                </span>
                {remoteModels.length > SEARCH_THRESHOLD && (
                  <input
                    value={search}
                    placeholder="搜索模型标识"
                    spellCheck={false}
                    onChange={(event) => setSearch(event.target.value)}
                  />
                )}
              </div>

              <ul className="import-model-list">
                {visible.map((model) => {
                  const draft = drafts[model.id];
                  const contextInvalid = draft !== undefined && parseContextWindow(draft.contextWindow) === undefined;

                  return (
                    <li key={model.id} className={`import-model ${draft ? 'selected' : ''}`}>
                      <label className="import-model-row">
                        <input
                          type="checkbox"
                          checked={model.imported || draft !== undefined}
                          disabled={model.imported}
                          onChange={() => toggle(model.id)}
                        />
                        <span className="import-model-id">{model.id}</span>
                        {model.imported && <span className="model-status">已导入</span>}
                      </label>

                      {draft && (
                        <div className="import-model-fields">
                          <label>
                            显示名称
                            <input
                              value={draft.name}
                              maxLength={100}
                              onChange={(event) => updateDraft(model.id, { name: event.target.value })}
                            />
                          </label>
                          <label>
                            上下文窗口（可选）
                            <input
                              value={draft.contextWindow}
                              inputMode="numeric"
                              placeholder="例如：128000"
                              aria-invalid={contextInvalid}
                              onChange={(event) => updateDraft(model.id, { contextWindow: event.target.value })}
                            />
                          </label>
                          <label className="settings-dialog-check">
                            <input
                              type="checkbox"
                              checked={draft.supportsTemperature}
                              onChange={(event) =>
                                updateDraft(model.id, { supportsTemperature: event.target.checked })
                              }
                            />
                            支持 temperature
                          </label>
                        </div>
                      )}
                    </li>
                  );
                })}
                {visible.length === 0 && <li className="import-model-empty">没有匹配的模型。</li>}
              </ul>

              <p className="settings-dialog-hint">
                供应商的模型列表只有模型标识，不包含能力信息：所选模型都会作为对话模型导入，请确认显示名称、上下文和温度支持；embedding 等非对话模型不要导入。
              </p>
            </>
          )}

          {importMutation.isError && (
            <p className="settings-dialog-error">{importErrorText(importMutation.error)}</p>
          )}

          <div className="settings-dialog-actions">
            {remoteQuery.isError && (
              <button type="button" className="subtle-button" onClick={() => void remoteQuery.refetch()}>
                重新获取
              </button>
            )}
            <button type="button" className="subtle-button" onClick={onClose}>
              取消
            </button>
            <button type="submit" className="primary-button" disabled={!canImport}>
              {importMutation.isPending ? '导入中…' : `导入所选（${selected.length}）`}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}
