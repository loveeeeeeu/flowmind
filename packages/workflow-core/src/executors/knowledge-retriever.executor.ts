import type { ExecutionContext } from '../engine/execution-context.js';
import { WorkflowExecutionError } from '../engine/workflow-execution.error.js';
import type { WorkflowNode } from '../engine/workflow-engine.types.js';
import type { VariableResolver } from '../engine/variable-resolver.js';
import type { KnowledgeRetrieverPort, WorkflowRetrievedKnowledgeChunk } from '../ports/knowledge-retriever.js';
import type { NodeExecutor, NodeRetryMode } from './node-executor.js';

const MAX_CONTEXT_CHARS = 20_000;

export interface KnowledgeRetrieverNodeData {
  knowledgeBaseId: string;
  query: string;
  /** Variable holding { query, context, items }; the LLM normally references {{retrieved.context}}. */
  outputVariable?: string;
  topK?: number;
  minScore?: number;
}

export interface KnowledgeRetrieverNodeOutput {
  query: string;
  context: string;
  items: WorkflowRetrievedKnowledgeChunk[];
}

/** Keep `items` and `context` consistent: only the chunks that fit in context are exposed. */
export function buildKnowledgeContextResult(
  items: WorkflowRetrievedKnowledgeChunk[],
  maxChars = MAX_CONTEXT_CHARS,
): Pick<KnowledgeRetrieverNodeOutput, 'context' | 'items'> {
  const used: WorkflowRetrievedKnowledgeChunk[] = [];
  const sections: string[] = [];
  let total = 0;

  for (const item of items) {
    const section = [
      `[Source ${used.length + 1}]`,
      `Document: ${item.documentName}`,
      `Chunk: ${item.chunkIndex}`,
      'Content:',
      item.content,
    ].join('\n');

    if (total + section.length > maxChars) break;

    used.push(item);
    sections.push(section);
    total += section.length;
  }

  return { context: sections.join('\n\n'), items: used };
}

export class KnowledgeRetrieverExecutor implements NodeExecutor {
  readonly type = 'knowledgeRetriever';

  constructor(
    private readonly retriever: KnowledgeRetrieverPort,
    private readonly resolver: VariableResolver,
  ) {}

  getRetryMode(): NodeRetryMode {
    return 'transient';
  }

  async execute(node: WorkflowNode, context: ExecutionContext) {
    const data = node.data as Partial<KnowledgeRetrieverNodeData>;
    const query = typeof data.query === 'string' ? this.resolver.resolveString(data.query, context).trim() : '';

    if (!query) {
      throw new WorkflowExecutionError('Knowledge query is required', { code: 'KNOWLEDGE_QUERY_REQUIRED' });
    }
    if (typeof data.knowledgeBaseId !== 'string' || !data.knowledgeBaseId.trim()) {
      throw new WorkflowExecutionError('Knowledge base is required', { code: 'KNOWLEDGE_BASE_REQUIRED' });
    }
    if (!context.projectId) {
      throw new WorkflowExecutionError('Knowledge retrieval requires a project context', {
        code: 'PROJECT_CONTEXT_REQUIRED',
      });
    }

    const result = await this.retriever.retrieve({
      projectId: context.projectId,
      knowledgeBaseId: data.knowledgeBaseId,
      query,
      topK: data.topK,
      minScore: data.minScore,
    });
    const prepared = buildKnowledgeContextResult(result.items);

    const output = { query, context: prepared.context, items: prepared.items } satisfies KnowledgeRetrieverNodeOutput;
    // Existing canvases predate outputVariable. Use node.id as a collision-free compatibility fallback;
    // new nodes default to the readable "retrieved" variable.
    const outputVariable = typeof data.outputVariable === 'string' && data.outputVariable.trim()
      ? data.outputVariable.trim()
      : node.id;
    context.setVariable(outputVariable, output);

    return { output };
  }
}
