import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { TemplateNodeType } from '../types/workflowCanvas';
import { NodeCard } from './NodeCard';

export function TemplateNode({ data }: NodeProps<TemplateNodeType>) {
  return (
    <NodeCard
      icon="T"
      iconClassName="template"
      title={data.label || '模板'}
      meta={`文本模板 → ${data.outputVariable || '?'}`}
    >
      <Handle type="target" position={Position.Left} />
      <Handle type="source" position={Position.Right} />
    </NodeCard>
  );
}
