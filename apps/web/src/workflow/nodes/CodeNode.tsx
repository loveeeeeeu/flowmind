import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { CodeNodeType } from '../types/workflowCanvas';

export function CodeNode({ data, selected }: NodeProps<CodeNodeType>) {
  return (
    <div
      style={{
        minWidth: 180,
        maxWidth: 260,
        padding: 16,
        borderRadius: 10,
        border: selected ? '2px solid #333' : '1px solid #ddd',
        background: '#fff',
      }}
    >
      <Handle type="target" position={Position.Left} />

      <strong>{data.label || 'Code'}</strong>
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
        JS: {data.inputPath || '?'} → {data.outputVariable || '?'}
      </div>

      <Handle type="source" position={Position.Right} />
    </div>
  );
}
