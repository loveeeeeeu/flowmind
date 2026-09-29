import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { LlmNodeType } from '../types/workflowCanvas';

export function LlmNode({ data, selected }: NodeProps<LlmNodeType>) {
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

      <strong>{data.label || 'LLM'}</strong>
      <div style={{ marginTop: 6, fontSize: 12, color: '#777' }}>
        {data.model || 'No model'}
      </div>

      <Handle type="source" position={Position.Right} />
    </div>
  );
}