import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { VariableNodeType } from '../types/workflowCanvas';

export function VariableNode({ data, selected }: NodeProps<VariableNodeType>) {
  return (
    <div
      style={{
        minWidth: 180,
        padding: 16,
        borderRadius: 10,
        border: selected ? '2px solid #333' : '1px solid #ddd',
        background: '#fff',
      }}
    >
      <Handle type="target" position={Position.Left} />

      <strong>{data.label || 'Variable'}</strong>
      <div style={{ marginTop: 6, fontSize: 12, color: '#777' }}>
        {data.variableName || 'No variable'}
        {data.sourceType === 'reference' && ` ← ${String(data.value ?? '')}`}
      </div>

      <Handle type="source" position={Position.Right} />
    </div>
  );
}