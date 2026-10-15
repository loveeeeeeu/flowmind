import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { getAvailableModels } from '../../api/models';
import { queryKeys } from '../../api/queryKeys';
import { getProviderOption } from '../../settings/credentials/providers';
import { formatContextWindow } from '../../settings/models/modelFormat';
import type { AvailableModel } from '../../types/model';
import { getModelLabel, isLegacyLlmData, withSelectedModel } from '../llm/llmNodeData';
import type { LlmNodeData, LlmNodeType } from '../types/workflowCanvas';
import { Field } from './PanelField';

interface LlmPropertiesProps {
  node: LlmNodeType;
  onNodeDataChange: (nodeId: string, patch: Partial<LlmNodeData>) => void;
  onNodeDataReplace: (nodeId: string, data: LlmNodeData) => void;
}

function toOptionalNumber(value: string) {
  return value === '' ? undefined : Number(value);
}

/** Options grouped by credential, in the order the API returns them (credential name, model name). */
function groupByCredential(models: AvailableModel[]) {
  const groups = new Map<string, { name: string; models: AvailableModel[] }>();

  for (const model of models) {
    const group = groups.get(model.credential.id) ?? { name: model.credential.name, models: [] };
    group.models.push(model);
    groups.set(model.credential.id, group);
  }

  return [...groups.entries()];
}

/** The canvas stores only modelId; provider and model name below are display-only. */
export function LlmProperties({ node, onNodeDataChange, onNodeDataReplace }: LlmPropertiesProps) {
  const modelsQuery = useQuery({
    queryKey: queryKeys.models.available,
    queryFn: getAvailableModels,
  });

  const { data } = node;
  const modelId = data.modelId ?? '';
  const models = modelsQuery.data ?? [];
  const selectedModel = models.find((model) => model.id === modelId);
  const isLegacy = isLegacyLlmData(data);
  // Disabled, or its credential revoked: publish / test run will reject it.
  const isUnavailable = modelId !== '' && modelsQuery.isSuccess && !selectedModel;

  return (
    <>
      {isLegacy && (
        <p className="panel-notice warning">
          这个节点使用旧版配置（{data.provider ?? '未知供应商'} / {data.model ?? '未知模型'}
          ），需要从模型中心重新选择一个模型才能运行和发布。
        </p>
      )}

      <Field label="模型">
        <select
          value={modelId}
          disabled={modelsQuery.isPending}
          onChange={(event) => onNodeDataReplace(node.id, withSelectedModel(data, event.target.value))}
        >
          <option value="" disabled>
            {modelsQuery.isPending ? '正在加载模型…' : '选择模型'}
          </option>
          {isUnavailable && (
            <option value={modelId} disabled>
              不可用的模型
            </option>
          )}
          {groupByCredential(models).map(([credentialId, group]) => (
            <optgroup key={credentialId} label={group.name}>
              {group.models.map((model) => (
                <option key={model.id} value={model.id}>
                  {getModelLabel(model)}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </Field>

      {modelsQuery.isError && (
        <p className="panel-field-error">加载可用模型失败：{modelsQuery.error.message}</p>
      )}

      {modelsQuery.isSuccess && models.length === 0 && (
        <p className="panel-notice">
          还没有可用的模型。先在<Link to="/settings/models">模型中心</Link>为凭证添加模型。
        </p>
      )}

      {isUnavailable && (
        <p className="panel-notice danger">
          当前选择的模型已停用，或它的凭证已撤销，草稿无法再测试或发布，请重新选择模型。
          <span className="mono">模型 ID：{modelId}</span>
        </p>
      )}

      {selectedModel && (
        <dl className="llm-model-meta">
          <dt>供应商</dt>
          <dd>{getProviderOption(selectedModel.credential.provider).label}</dd>
          <dt>模型标识</dt>
          <dd className="mono">{selectedModel.modelName}</dd>
          <dt>上下文</dt>
          <dd>{formatContextWindow(selectedModel.contextWindow)}</dd>
        </dl>
      )}

      <Field label="系统提示词">
        <textarea
          rows={4}
          placeholder="你是一个乐于助人的助手。"
          value={data.systemPrompt ?? ''}
          onChange={(event) => onNodeDataChange(node.id, { systemPrompt: event.target.value })}
        />
      </Field>

      <Field label="用户提示词">
        <textarea
          rows={10}
          placeholder="使用 {{变量名}} 引用变量"
          value={data.prompt ?? ''}
          onChange={(event) => onNodeDataChange(node.id, { prompt: event.target.value })}
        />
      </Field>

      {/* Hidden, not cleared: switching back to a model that supports it restores the value. */}
      {selectedModel?.supportsTemperature === false ? (
        <p className="panel-hint">该模型不支持温度参数，运行时不会发送。</p>
      ) : (
        <Field label="温度（0 ~ 2）">
          <input
            type="number"
            min={0}
            max={2}
            step={0.1}
            placeholder="0.7"
            value={data.temperature ?? ''}
            onChange={(event) =>
              onNodeDataChange(node.id, { temperature: toOptionalNumber(event.target.value) })
            }
          />
        </Field>
      )}

      <Field label="输出变量">
        <input
          placeholder="answer"
          value={data.outputVariable ?? ''}
          onChange={(event) => onNodeDataChange(node.id, { outputVariable: event.target.value })}
        />
      </Field>
    </>
  );
}
