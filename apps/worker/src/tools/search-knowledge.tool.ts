import type { Tool, ToolExecutionContext, ToolExecutionResult } from '@flowmind/shared';
import { ToolInputError } from '@flowmind/tool-runtime';
import type { KnowledgeRetrieverPort } from '@flowmind/workflow-core';

interface SearchKnowledgeToolInput {
  knowledgeBaseId: string;
  query: string;
  topK?: number;
}

/**
 * Built-in agent capability that reuses the existing retrieval port. projectId is intentionally
 * taken only from the trusted execution context, never from model-generated arguments.
 */
export class SearchKnowledgeTool implements Tool {
  readonly definition = {
    name: 'search_knowledge',
    displayName: 'Search Knowledge',
    description: 'Searches a FlowMind knowledge base for information relevant to a user query.',
    source: 'BUILT_IN',
    inputSchema: {
      type: 'object',
      properties: {
        knowledgeBaseId: { type: 'string', description: 'The FlowMind knowledge base ID to search.' },
        query: { type: 'string', description: 'The natural-language search query.' },
        topK: { type: 'integer', minimum: 1, maximum: 20, description: 'Maximum number of matching chunks.' },
      },
      required: ['knowledgeBaseId', 'query'],
      additionalProperties: false,
    },
  } as const;

  constructor(private readonly retriever: KnowledgeRetrieverPort) {}

  async execute(rawInput: unknown, context: ToolExecutionContext): Promise<ToolExecutionResult> {
    const input = parseSearchKnowledgeInput(rawInput);
    const result = await this.retriever.retrieve({
      projectId: context.projectId,
      knowledgeBaseId: input.knowledgeBaseId,
      query: input.query,
      topK: input.topK,
    });
    return { output: result };
  }
}

function parseSearchKnowledgeInput(value: unknown): SearchKnowledgeToolInput {
  if (!isRecord(value)) throw new ToolInputError('Search knowledge input must be an object');
  const allowedKeys = new Set(['knowledgeBaseId', 'query', 'topK']);
  if (Object.keys(value).some((key) => !allowedKeys.has(key))) {
    throw new ToolInputError('Search knowledge input contains an unsupported field');
  }
  if (typeof value.knowledgeBaseId !== 'string' || !value.knowledgeBaseId.trim()) {
    throw new ToolInputError('knowledgeBaseId must be a non-empty string');
  }
  if (typeof value.query !== 'string' || !value.query.trim()) {
    throw new ToolInputError('query must be a non-empty string');
  }
  const topK = value.topK;
  if (topK !== undefined && (typeof topK !== 'number' || !Number.isInteger(topK) || topK < 1 || topK > 20)) {
    throw new ToolInputError('topK must be an integer between 1 and 20');
  }

  return {
    knowledgeBaseId: value.knowledgeBaseId.trim(),
    query: value.query.trim(),
    ...(topK === undefined ? {} : { topK }),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
