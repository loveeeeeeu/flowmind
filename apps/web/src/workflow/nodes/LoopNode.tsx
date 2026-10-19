import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { LoopNodeType } from '../types/workflowCanvas';
import { NodeCard } from './NodeCard';
import { getNodeExecution } from '../execution/executionOverlay';

export function LoopNode({ data }: NodeProps<LoopNodeType>) {
  return (
    <NodeCard
      icon="↻"
      iconClassName="loop"
      title={data.label || '循环'}
      meta={`遍历 ${data.itemsPath || '?'} → ${data.itemVariable || 'item'}`}
      className="has-branches has-loop-target"
      execution={getNodeExecution(data)}
    >
      <Handle type="target" position={Position.Left} />

      <Handle id="body" type="source" position={Position.Right} className="is-upper" />
      <span className="flow-node-branch is-upper is-body">循环体</span>

      <Handle id="done" type="source" position={Position.Right} className="is-lower" />
      <span className="flow-node-branch is-lower is-done">完成</span>

      <Handle id="loop" type="target" position={Position.Bottom} />
      <span className="flow-node-loop-label">回到循环</span>
    </NodeCard>
  );
}
