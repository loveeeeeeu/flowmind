import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { EndNodeType } from '../types/workflowCanvas';

export function EndNode({ data }: NodeProps<EndNodeType>) {
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
      <Handle type="target" position={Position.Left} />

      <strong>{data.label}</strong>
      <div style={{ marginTop: 6, fontSize: 12, color: '#777' }}>Workflow output</div>
    </div>
  );
}