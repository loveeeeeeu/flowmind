import type { PrismaService } from '../prisma/prisma.service.js';
import { apiError } from '../common/api-error.js';
import type { KnowledgeQueryEmbeddingService } from './knowledge-query-embedding.service.js';
import { KnowledgeRetrieverService } from './knowledge-retriever.service.js';
import type { KnowledgeVectorSearchService } from './knowledge-vector-search.service.js';

function setup({ knowledgeBase = { embeddingModelId: 'embed-1', embeddingDimensions: 2 } } = {}) {
  const findFirst = vi.fn(async () => knowledgeBase);
  const embed = vi.fn(async () => ({ vector: [0.1, 0.2], dimensions: 2 }));
  const searchKnowledgeBase = vi.fn(async () => [
    { chunkId: 'c1', documentId: 'd1', documentName: 'Handbook', chunkIndex: 0, content: '住宿上限 600 元', metadata: null, score: 0.91 },
    { chunkId: 'c2', documentId: 'd1', documentName: 'Handbook', chunkIndex: 1, content: '弱相关内容', metadata: null, score: 0.21 },
  ]);
  const service = new KnowledgeRetrieverService(
    { knowledgeBase: { findFirst } } as unknown as PrismaService,
    { embed } as unknown as KnowledgeQueryEmbeddingService,
    { searchKnowledgeBase } as unknown as KnowledgeVectorSearchService,
  );
  return { service, embed, searchKnowledgeBase };
}

describe('KnowledgeRetrieverService', () => {
  it('uses the knowledge base model, defaults topK to 5, and filters weak matches after Top K search', async () => {
    const { service, embed, searchKnowledgeBase } = setup();
    await expect(service.retrieve({ projectId: 'project-1', knowledgeBaseId: 'kb-1', query: ' 住宿最高多少钱？ ', minScore: 0.5 }))
      .resolves.toMatchObject({ query: '住宿最高多少钱？', topK: 5, items: [{ chunkId: 'c1', score: 0.91 }] });
    expect(embed).toHaveBeenCalledWith('project-1', 'embed-1', '住宿最高多少钱？');
    expect(searchKnowledgeBase).toHaveBeenCalledWith({
      projectId: 'project-1', knowledgeBaseId: 'kb-1', queryVector: [0.1, 0.2], topK: 5,
    });
  });

  it('rejects blank queries before spending an embedding request', async () => {
    const { service, embed } = setup();
    await expect(service.retrieve({ projectId: 'project-1', knowledgeBaseId: 'kb-1', query: '  ' }))
      .rejects.toThrow(apiError.badRequest('KNOWLEDGE_QUERY_REQUIRED', 'Knowledge query is required'));
    expect(embed).not.toHaveBeenCalled();
  });

  it('never sends a dimension-mismatched query vector to pgvector', async () => {
    const { searchKnowledgeBase } = setup();
    const embed = vi.fn(async () => ({ vector: [0.1, 0.2, 0.3], dimensions: 3 }));
    const mismatch = new KnowledgeRetrieverService(
      { knowledgeBase: { findFirst: vi.fn(async () => ({ embeddingModelId: 'embed-1', embeddingDimensions: 2 })) } } as unknown as PrismaService,
      { embed } as unknown as KnowledgeQueryEmbeddingService,
      { searchKnowledgeBase } as unknown as KnowledgeVectorSearchService,
    );
    await expect(mismatch.retrieve({ projectId: 'project-1', knowledgeBaseId: 'kb-1', query: 'question' }))
      .rejects.toThrow(apiError.internal('KNOWLEDGE_VECTOR_DIMENSION_MISMATCH', 'Knowledge vector dimensions do not match query embedding dimensions'));
    expect(searchKnowledgeBase).not.toHaveBeenCalled();
  });
});
