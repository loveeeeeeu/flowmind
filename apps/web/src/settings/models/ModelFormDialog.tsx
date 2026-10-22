import { useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ApiRequestError } from '../../api/client';
import { createModel, updateModel } from '../../api/models';
import { queryKeys } from '../../api/queryKeys';
import type { Credential } from '../../types/credential';
import type { Model, ModelType } from '../../types/model';
import { parseContextWindow } from './modelFormat';

interface ModelFormDialogProps {
  projectId: string;
  credential: Credential;
  /** Edit this model's metadata; create a new one when absent. */
  model?: Model;
  onClose: () => void;
}

function errorText(error: Error, modelName: string) {
  if (error instanceof ApiRequestError && error.code === 'MODEL_NAME_CONFLICT') {
    return `这个凭证下已经有模型标识「${modelName.trim()}」了。`;
  }

  return `保存失败：${error.message}`;
}

function parseEmbeddingDimensions(value: string): number | undefined {
  if (!/^\d+$/.test(value.trim())) return undefined;
  const dimensions = Number(value);
  return Number.isSafeInteger(dimensions) && dimensions > 0 && dimensions <= 100_000 ? dimensions : undefined;
}

/** modelName is read-only when editing: published LLM nodes call whatever the id points at. */
export function ModelFormDialog({ projectId, credential, model, onClose }: ModelFormDialogProps) {
  const queryClient = useQueryClient();
  const isEdit = model !== undefined;
  const [name, setName] = useState(model?.name ?? '');
  const [modelName, setModelName] = useState(model?.modelName ?? '');
  const [type, setType] = useState<ModelType>(model?.type ?? 'CHAT');
  const [embeddingDimensions, setEmbeddingDimensions] = useState(model?.embeddingDimensions?.toString() ?? '');
  const [contextWindow, setContextWindow] = useState(model?.contextWindow?.toString() ?? '');
  const [supportsTemperature, setSupportsTemperature] = useState(model?.supportsTemperature ?? true);

  // undefined: not a positive integer; null: left empty.
  const parsedContextWindow = parseContextWindow(contextWindow);
  const parsedEmbeddingDimensions = parseEmbeddingDimensions(embeddingDimensions);

  const saveMutation = useMutation({
    mutationFn: () => {
      if (isEdit) {
        return updateModel(projectId, model.id, {
          name: name.trim(),
          contextWindow: parsedContextWindow ?? null,
          supportsTemperature,
        });
      }

      return createModel(projectId, credential.id, {
        name: name.trim(),
        modelName: modelName.trim(),
        type,
        ...(parsedContextWindow ? { contextWindow: parsedContextWindow } : {}),
        ...(type === 'EMBEDDING'
          ? { embeddingDimensions: parsedEmbeddingDimensions, supportsTemperature: false }
          : { supportsTemperature }),
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.models.all(projectId) });
      onClose();
    },
  });

  const canSubmit =
    name.trim() !== '' &&
    modelName.trim() !== '' &&
    parsedContextWindow !== undefined &&
    (type === 'CHAT' || parsedEmbeddingDimensions !== undefined) &&
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
        aria-label={isEdit ? '编辑模型' : '添加模型'}
      >
        <form className="settings-dialog-body" onSubmit={handleSubmit}>
          <h2>{isEdit ? '编辑模型' : '添加模型'}</h2>
          <p className="settings-dialog-context">凭证：{credential.name}</p>

          <label>
            模型标识
            <input
              autoFocus={!isEdit}
              value={modelName}
              disabled={isEdit}
              maxLength={200}
              spellCheck={false}
              placeholder="例如：gpt-4.1-mini、deepseek-chat"
              onChange={(event) => setModelName(event.target.value)}
            />
            <span className="settings-dialog-hint">
              {isEdit
                ? '创建后不可修改；需要换成别的模型请新建一个。'
                : '原样发送给模型供应商 API 的模型名，必须与供应商文档完全一致。'}
            </span>
          </label>

          <label>
            显示名称
            <input
              autoFocus={isEdit}
              value={name}
              maxLength={100}
              placeholder="例如：GPT-4.1 Mini"
              onChange={(event) => setName(event.target.value)}
            />
            <span className="settings-dialog-hint">只在 FlowMind 中显示，随时可以修改。</span>
          </label>

          <label>
            模型类型
            <select value={type} disabled={isEdit} onChange={(event) => setType(event.target.value as ModelType)}>
              <option value="CHAT">对话（CHAT）</option>
              <option value="EMBEDDING">向量（EMBEDDING）</option>
            </select>
            <span className="settings-dialog-hint">
              {isEdit ? '创建后类型不可修改。' : 'EMBEDDING 用于把知识库文档和查询文本转换成向量。'}
            </span>
          </label>

          {type === 'EMBEDDING' && (
            <label>
              向量维度
              <input
                value={embeddingDimensions}
                inputMode="numeric"
                placeholder="例如：1536"
                onChange={(event) => setEmbeddingDimensions(event.target.value)}
              />
              <span className="settings-dialog-hint">必须与供应商实际返回的向量长度完全一致；创建后不能修改。</span>
            </label>
          )}

          {type === 'CHAT' && <>
          <label>
            上下文窗口（可选）
            <input
              value={contextWindow}
              inputMode="numeric"
              placeholder="例如：128000"
              onChange={(event) => setContextWindow(event.target.value)}
            />
            <span className="settings-dialog-hint">
              {parsedContextWindow === undefined ? '请输入正整数（token 数）。' : 'token 数，仅用于展示参考。'}
            </span>
          </label>

          <label className="settings-dialog-check">
            <input
              type="checkbox"
              checked={supportsTemperature}
              onChange={(event) => setSupportsTemperature(event.target.checked)}
            />
            支持 temperature 参数
          </label>
          </>}

          {saveMutation.isError && (
            <p className="settings-dialog-error">{errorText(saveMutation.error, modelName)}</p>
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
