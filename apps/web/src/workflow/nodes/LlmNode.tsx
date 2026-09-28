import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { LlmNodeType } from '../types/workflowCanvas';

export function LlmNode({ data }: NodeProps<LlmNodeType>) {
  return (
    <div
      style={{
        minWidth: 180,
        padding: 16,
        borderRadius: 10,
        border: '1px solid #ddd',
        background: '#fff',
      }}
    >
      <Handle type="target" position={Position.Left} />

      <strong>{data.label}</strong>
      <div style={{ marginTop: 6, fontSize: 12, color: '#777' }}>Large Language Model</div>

      <Handle type="source" position={Position.Right} />
    </div>
  );
}