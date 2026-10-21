export interface KnowledgeRetrieveInput {
  projectId: string;
  knowledgeBaseId: string;
  query: string;
  topK?: number;
  minScore?: number;
}

export interface RetrievedKnowledgeChunk {
  chunkId: string;
  documentId: string;
  documentName: string;
  chunkIndex: number;
  content: string;
  metadata: Record<string, unknown> | null;
  score: number;
}

export interface KnowledgeRetrieveResult {
  query: string;
  topK: number;
  items: RetrievedKnowledgeChunk[];
}
