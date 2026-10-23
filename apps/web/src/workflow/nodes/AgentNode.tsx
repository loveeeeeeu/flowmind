import { useContext } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { AvailableModelsContext, getModelLabel } from '../llm/llmNodeData';
import type { AgentNodeType } from '../types/workflowCanvas';
import { getNodeExecution } from '../execution/executionOverlay';
import { NodeCard } from './NodeCard';

export function AgentNode({ data }: NodeProps<AgentNodeType>) {
  const models = useContext(AvailableModelsContext);
  const model = data.modelId ? models?.get(data.modelId) : undefined;
  const meta = !data.modelId
    ? <span className="flow-node-warning">未选择模型</span>
    : model
      ? <>{getModelLabel(model)} · {data.toolNames.length} tools · {data.maxSteps ?? 5} steps</>
      : <span className="flow-node-warning">模型不可用</span>;

  return <NodeCard icon="✦" iconClassName="ai" title={data.label || 'Agent'} meta={meta} execution={getNodeExecution(data)}>
    <Handle type="target" position={Position.Left} />
    <Handle type="source" position={Position.Right} />
  </NodeCard>;
}
