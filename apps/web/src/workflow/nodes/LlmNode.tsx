import { useContext } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { AvailableModelsContext, getModelLabel, isLegacyLlmData } from '../llm/llmNodeData';
import type { LlmNodeType } from '../types/workflowCanvas';
import { NodeCard } from './NodeCard';
import { getNodeExecution } from '../execution/executionOverlay';

export function LlmNode({ data }: NodeProps<LlmNodeType>) {
  const models = useContext(AvailableModelsContext);
  const model = data.modelId ? models?.get(data.modelId) : undefined;

  let meta = <span className="flow-node-warning">⚠ 未选择模型</span>;

  if (isLegacyLlmData(data)) {
    meta = <span className="flow-node-warning">⚠ 旧版配置，需重新选择模型</span>;
  } else if (model) {
    meta = <>{getModelLabel(model)}</>;
  } else if (data.modelId) {
    meta = models ? <span className="flow-node-warning">⚠ 模型不可用</span> : <>已选择模型</>;
  }

  return (
    <NodeCard icon="✦" iconClassName="ai" title={data.label || 'LLM'} meta={meta} execution={getNodeExecution(data)}>
      <Handle type="target" position={Position.Left} />
      <Handle type="source" position={Position.Right} />
    </NodeCard>
  );
}
