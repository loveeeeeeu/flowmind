import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { LlmNodeType } from '../types/workflowCanvas';
import { NodeCard } from './NodeCard';

export function LlmNode({ data }: NodeProps<LlmNodeType>) {
  return (
    <NodeCard
      icon="✦"
      iconClassName="ai"
      title={data.label || 'LLM'}
      meta={`${data.provider || '未选择供应商'} / ${data.model || '未设置模型'}`}
    >
      <Handle type="target" position={Position.Left} />
      <Handle type="source" position={Position.Right} />
    </NodeCard>
  );
}
