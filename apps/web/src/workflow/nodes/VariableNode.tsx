import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { VariableNodeType } from '../types/workflowCanvas';
import { NodeCard } from './NodeCard';

export function VariableNode({ data }: NodeProps<VariableNodeType>) {
  const name = data.variableName || '未命名变量';
  const meta = data.sourceType === 'reference' ? `${name} ← ${String(data.value ?? '')}` : name;

  return (
    <NodeCard icon="{}" iconClassName="variable" title={data.label || '变量'} meta={meta}>
      <Handle type="target" position={Position.Left} />
      <Handle type="source" position={Position.Right} />
    </NodeCard>
  );
}
