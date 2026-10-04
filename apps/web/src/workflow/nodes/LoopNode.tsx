import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { LoopNodeType } from '../types/workflowCanvas';

const handleLabelStyle = {
  position: 'absolute',
  right: 12,
  fontSize: 11,
  transform: 'translateY(-50%)',
} as const;

export function LoopNode({ data, selected }: NodeProps<LoopNodeType>) {
  return (
    <div
      style={{
        position: 'relative',
        minWidth: 190,
        maxWidth: 260,
        padding: '16px 48px 26px 16px',
        borderRadius: 10,
        border: selected ? '2px solid #333' : '1px solid #ddd',
        background: '#fff',
      }}
    >
      <Handle type="target" position={Position.Left} />

      <strong>{data.label || 'Loop'}</strong>
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
        for {data.itemVariable || 'item'} in {data.itemsPath || '?'}
      </div>

      <Handle id="body" type="source" position={Position.Right} style={{ top: '35%' }} />
      <span style={{ ...handleLabelStyle, top: '35%', color: '#2563eb' }}>body</span>

      <Handle id="done" type="source" position={Position.Right} style={{ top: '70%' }} />
      <span style={{ ...handleLabelStyle, top: '70%', color: '#15803d' }}>done</span>

      <Handle id="loop" type="target" position={Position.Bottom} />
      <span
        style={{
          position: 'absolute',
          bottom: 6,
          left: '50%',
          transform: 'translateX(-50%)',
          fontSize: 11,
          color: '#b45309',
        }}
      >
        loop
      </span>
    </div>
  );
}
