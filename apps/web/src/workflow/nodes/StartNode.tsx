import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { StartNodeType } from '../types/workflowCanvas';

export function StartNode({ data }: NodeProps<StartNodeType>) {
  return (
    <div
      style={{
        minWidth: 140,
        padding: 16,
        borderRadius: 10,
        border: '1px solid #ddd',
        background: '#fff',
      }}
    >
      <strong>{data.label}</strong>
      <div style={{ marginTop: 6, fontSize: 12, color: '#777' }}>Workflow input</div>

      <Handle type="source" position={Position.Right} />
    </div>
  );
}