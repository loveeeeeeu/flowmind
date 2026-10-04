import { Handle, Position, type NodeProps } from '@xyflow/react';
import { CONDITION_OPERATORS, type IfNodeType } from '../types/workflowCanvas';

const handleLabelStyle = {
  position: 'absolute',
  right: 12,
  fontSize: 11,
  transform: 'translateY(-50%)',
} as const;

export function IfNode({ data, selected }: NodeProps<IfNodeType>) {
  const operatorLabel =
    CONDITION_OPERATORS.find((item) => item.value === data.operator)?.label ?? data.operator;

  return (
    <div
      style={{
        position: 'relative',
        minWidth: 190,
        maxWidth: 260,
        padding: '16px 48px 16px 16px',
        borderRadius: 10,
        border: selected ? '2px solid #333' : '1px solid #ddd',
        background: '#fff',
      }}
    >
      <Handle type="target" position={Position.Left} />

      <strong>{data.label || 'IF'}</strong>
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
        {data.variable || '?'} {operatorLabel} {data.value}
      </div>

      <Handle id="true" type="source" position={Position.Right} style={{ top: '35%' }} />
      <span style={{ ...handleLabelStyle, top: '35%', color: '#15803d' }}>true</span>

      <Handle id="false" type="source" position={Position.Right} style={{ top: '70%' }} />
      <span style={{ ...handleLabelStyle, top: '70%', color: '#d32f2f' }}>false</span>
    </div>
  );
}
