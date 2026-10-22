import { useQuery } from '@tanstack/react-query';
import { getKnowledgeBases } from '../../api/knowledge';
import { queryKeys } from '../../api/queryKeys';
import type { KnowledgeRetrieverNodeType, WorkflowNodeData } from '../types/workflowCanvas';
import { Field } from './PanelField';

interface KnowledgeRetrieverPropertiesProps {
  projectId: string;
  node: KnowledgeRetrieverNodeType;
  onNodeDataChange: (nodeId: string, patch: Partial<WorkflowNodeData>) => void;
}

function optionalNumber(value: string) {
  return value === '' ? undefined : Number(value);
}

export function KnowledgeRetrieverProperties({ projectId, node, onNodeDataChange }: KnowledgeRetrieverPropertiesProps) {
  const knowledgeBasesQuery = useQuery({
    queryKey: queryKeys.knowledgeBases.list(projectId),
    queryFn: () => getKnowledgeBases(projectId),
  });
  const available = (knowledgeBasesQuery.data ?? []).filter((knowledgeBase) => knowledgeBase.enabled);
  const selectedDisabled = knowledgeBasesQuery.data?.find((knowledgeBase) => knowledgeBase.id === node.data.knowledgeBaseId && !knowledgeBase.enabled);

  return (
    <>
      <Field label="Knowledge Base">
        <select value={node.data.knowledgeBaseId ?? ''} onChange={(event) => onNodeDataChange(node.id, { knowledgeBaseId: event.target.value })}>
          <option value="">Select a knowledge base</option>
          {selectedDisabled && <option value={selectedDisabled.id} disabled>{selectedDisabled.name} (disabled)</option>}
          {available.map((knowledgeBase) => <option key={knowledgeBase.id} value={knowledgeBase.id}>{knowledgeBase.name}</option>)}
        </select>
      </Field>
      <Field label="Query">
        <textarea rows={4} placeholder="{{question}}" value={node.data.query ?? ''} onChange={(event) => onNodeDataChange(node.id, { query: event.target.value })} />
      </Field>
      <Field label="Output Variable">
        <input placeholder="retrieved" value={node.data.outputVariable ?? node.id} onChange={(event) => onNodeDataChange(node.id, { outputVariable: event.target.value })} />
      </Field>
      <Field label="Top K (1–20)">
        <input type="number" min={1} max={20} value={node.data.topK ?? ''} onChange={(event) => onNodeDataChange(node.id, { topK: optionalNumber(event.target.value) })} />
      </Field>
      <Field label="Min Score (-1–1, optional)">
        <input type="number" min={-1} max={1} step={0.05} value={node.data.minScore ?? ''} onChange={(event) => onNodeDataChange(node.id, { minScore: optionalNumber(event.target.value) })} />
      </Field>
      <p className="panel-hint">Use <code>{'{{retrieved.context}}'}</code> in an LLM prompt (replace <code>retrieved</code> with the output variable above). <code>items</code> stays available for debugging and sources.</p>
    </>
  );
}
