import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { HttpNodeType } from '../types/workflowCanvas';

export function HttpNode({ data, selected }: NodeProps<HttpNodeType>) {
  return (
    <div
      style={{
        minWidth: 190,
        maxWidth: 260,
        padding: 16,
        borderRadius: 10,
        border: selected ? '2px solid #333' : '1px solid #ddd',
        background: '#fff',
      }}
    >
      <Handle type="target" position={Position.Left} />

      <strong>{data.label || 'HTTP'}</strong>
      <div
        style={{
          marginTop: 6,
          fontSize: 12,
          color: '#777',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {data.method} {data.url || 'No URL'}
      </div>

      <Handle type="source" position={Position.Right} />
    </div>
  );
}