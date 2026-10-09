import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { EndNodeType } from '../types/workflowCanvas';
import { NodeCard } from './NodeCard';

export function EndNode({ data }: NodeProps<EndNodeType>) {
  return (
    <NodeCard
      icon="■"
      iconClassName="end"
      title={data.label || '结束'}
      meta={`输出变量 · ${data.outputVariable || '未设置'}`}
    >
      <Handle type="target" position={Position.Left} />
    </NodeCard>
  );
}
