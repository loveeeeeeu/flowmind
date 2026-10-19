import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { CodeNodeType } from '../types/workflowCanvas';
import { NodeCard } from './NodeCard';
import { getNodeExecution } from '../execution/executionOverlay';

export function CodeNode({ data }: NodeProps<CodeNodeType>) {
  return (
    <NodeCard
      icon="›_"
      iconClassName="code"
      title={data.label || '代码执行'}
      meta={`JavaScript · ${data.inputPath || '?'} → ${data.outputVariable || '?'}`}
      execution={getNodeExecution(data)}
    >
      <Handle type="target" position={Position.Left} />
      <Handle type="source" position={Position.Right} />
    </NodeCard>
  );
}
