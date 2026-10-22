import { useContext } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { getNodeExecution } from '../execution/executionOverlay';
import { AvailableKnowledgeBasesContext } from '../knowledge/knowledgeRetrieverNodeData';
import type { KnowledgeRetrieverNodeType } from '../types/workflowCanvas';
import { NodeCard } from './NodeCard';

export function KnowledgeRetrieverNode({ data }: NodeProps<KnowledgeRetrieverNodeType>) {
  const knowledgeBases = useContext(AvailableKnowledgeBasesContext);
  const knowledgeBase = data.knowledgeBaseId ? knowledgeBases?.get(data.knowledgeBaseId) : undefined;
  const meta = !data.knowledgeBaseId
    ? <span className="flow-node-warning">Select a knowledge base</span>
    : knowledgeBase
      ? <>{knowledgeBase.name}</>
      : knowledgeBases
        ? <span className="flow-node-warning">Knowledge base unavailable</span>
        : <>Knowledge base selected</>;

  return (
    <NodeCard icon="⌕" iconClassName="knowledge" title={data.label || 'Knowledge Retriever'} meta={meta} execution={getNodeExecution(data)}>
      <Handle type="target" position={Position.Left} />
      <Handle type="source" position={Position.Right} />
    </NodeCard>
  );
}
