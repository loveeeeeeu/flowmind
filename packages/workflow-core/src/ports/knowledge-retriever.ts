/**
 * Boundary between the workflow engine and the knowledge runtime.  The engine deliberately
 * knows neither Prisma nor pgvector nor provider credentials.
 */
export interface WorkflowKnowledgeRetrieveInput {
  projectId: string;
  knowledgeBaseId: string;
  query: string;
  topK?: number;
  minScore?: number;
}

export interface WorkflowRetrievedKnowledgeChunk {
  chunkId: string;
  documentId: string;
  documentName: string;
  chunkIndex: number;
  content: string;
  metadata: Record<string, unknown> | null;
  score: number;
}

export interface WorkflowKnowledgeRetrieveResult {
  items: WorkflowRetrievedKnowledgeChunk[];
}

export interface KnowledgeRetrieverPort {
  retrieve(input: WorkflowKnowledgeRetrieveInput): Promise<WorkflowKnowledgeRetrieveResult>;
}
