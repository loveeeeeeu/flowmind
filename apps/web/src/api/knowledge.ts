import { request } from './client';

export interface AvailableKnowledgeBase {
  id: string;
  name: string;
  enabled: boolean;
  embeddingModelId: string | null;
}

export interface KnowledgeBase extends AvailableKnowledgeBase {
  projectId: string;
  description: string | null;
  embeddingDimensions: number | null;
  embeddingModel: { id: string; name: string; modelName: string; embeddingDimensions: number | null } | null;
  _count: { documents: number };
  createdAt: string;
  updatedAt: string;
}

export interface KnowledgeDocument {
  id: string;
  knowledgeBaseId: string;
  name: string;
  sourceType: 'TEXT' | 'FILE';
  status: 'PENDING' | 'PROCESSING' | 'READY' | 'FAILED';
  errorCode: string | null;
  errorMessage: string | null;
  _count: { chunks: number };
  createdAt: string;
  updatedAt: string;
}

export interface KnowledgeChunk {
  id: string;
  chunkIndex: number;
  content: string;
  tokenCount: number | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export interface KnowledgeSearchResult {
  query: string;
  topK: number;
  items: Array<{
    chunkId: string;
    documentId: string;
    documentName: string;
    chunkIndex: number;
    content: string;
    score: number;
    metadata: Record<string, unknown> | null;
  }>;
}

export function getKnowledgeBases(projectId: string): Promise<KnowledgeBase[]> {
  return request<KnowledgeBase[]>(`/projects/${projectId}/knowledge-bases`);
}

export function createKnowledgeBase(projectId: string, input: { name: string; description?: string; embeddingModelId?: string }) {
  return request<KnowledgeBase>(`/projects/${projectId}/knowledge-bases`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input),
  });
}

export function updateKnowledgeBase(projectId: string, knowledgeBaseId: string, input: { name?: string; description?: string | null; embeddingModelId?: string | null; enabled?: boolean }) {
  return request<KnowledgeBase>(`/projects/${projectId}/knowledge-bases/${knowledgeBaseId}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input),
  });
}

export function deleteKnowledgeBase(projectId: string, knowledgeBaseId: string) {
  return request<void>(`/projects/${projectId}/knowledge-bases/${knowledgeBaseId}`, { method: 'DELETE' });
}

export function getKnowledgeDocuments(projectId: string, knowledgeBaseId: string) {
  return request<KnowledgeDocument[]>(`/projects/${projectId}/knowledge-bases/${knowledgeBaseId}/documents`);
}

export function createTextDocument(projectId: string, knowledgeBaseId: string, input: { name: string; text: string }) {
  return request<KnowledgeDocument>(`/projects/${projectId}/knowledge-bases/${knowledgeBaseId}/documents`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...input, sourceType: 'TEXT' }),
  });
}

export function retryKnowledgeDocument(projectId: string, knowledgeBaseId: string, documentId: string) {
  return request<void>(`/projects/${projectId}/knowledge-bases/${knowledgeBaseId}/documents/${documentId}/retry`, { method: 'POST' });
}

export function getKnowledgeChunks(projectId: string, knowledgeBaseId: string, documentId: string) {
  return request<KnowledgeChunk[]>(`/projects/${projectId}/knowledge-bases/${knowledgeBaseId}/documents/${documentId}/chunks`);
}

export function searchKnowledge(projectId: string, knowledgeBaseId: string, input: { query: string; topK?: number; minScore?: number }) {
  return request<KnowledgeSearchResult>(`/projects/${projectId}/knowledge-bases/${knowledgeBaseId}/search`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input),
  });
}
