import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { StartNodeType } from '../types/workflowCanvas';
import { NodeCard } from './NodeCard';

export function StartNode({ data }: NodeProps<StartNodeType>) {
  return (
    <NodeCard icon="▶" iconClassName="start" title={data.label || '开始'} meta="工作流输入">
      <Handle type="source" position={Position.Right} />
    </NodeCard>
  );
}
