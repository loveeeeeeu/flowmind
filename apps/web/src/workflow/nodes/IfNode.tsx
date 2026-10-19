import { Handle, Position, type NodeProps } from '@xyflow/react';
import { CONDITION_OPERATORS, type IfNodeType } from '../types/workflowCanvas';
import { NodeCard } from './NodeCard';
import { getNodeExecution } from '../execution/executionOverlay';

export function IfNode({ data }: NodeProps<IfNodeType>) {
  const operatorLabel =
    CONDITION_OPERATORS.find((item) => item.value === data.operator)?.label ?? data.operator;

  return (
    <NodeCard
      icon="⌘"
      iconClassName="condition"
      title={data.label || '条件分支'}
      meta={`${data.variable || '?'} ${operatorLabel} ${data.value}`}
      className="has-branches"
      execution={getNodeExecution(data)}
    >
      <Handle type="target" position={Position.Left} />

      <Handle id="true" type="source" position={Position.Right} className="is-upper" />
      <span className="flow-node-branch is-upper is-true">IF</span>

      <Handle id="false" type="source" position={Position.Right} className="is-lower" />
      <span className="flow-node-branch is-lower is-false">ELSE</span>
    </NodeCard>
  );
}
