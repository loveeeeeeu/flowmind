import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { TemplateNodeType } from '../types/workflowCanvas';

export function TemplateNode({ data, selected }: NodeProps<TemplateNodeType>) {
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

      <strong>{data.label || 'Template'}</strong>
      <div style={{ marginTop: 6, fontSize: 12, color: '#777' }}>
        Text Template → {data.outputVariable || '?'}
      </div>

      <Handle type="source" position={Position.Right} />
    </div>
  );
}