import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { HttpNodeType } from '../types/workflowCanvas';
import { NodeCard } from './NodeCard';
import { getNodeExecution } from '../execution/executionOverlay';

export function HttpNode({ data }: NodeProps<HttpNodeType>) {
  return (
    <NodeCard
      icon="↗"
      iconClassName="http"
      title={data.label || 'HTTP 请求'}
      meta={`${data.method} ${data.url || '未设置 URL'}`}
      execution={getNodeExecution(data)}
    >
      <Handle type="target" position={Position.Left} />
      <Handle type="source" position={Position.Right} />
    </NodeCard>
  );
}
