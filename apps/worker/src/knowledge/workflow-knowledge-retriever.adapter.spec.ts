import type { PrismaService } from '../prisma/prisma.service.js';
import type { EmbeddingService } from '../embedding/embedding.service.js';
import { WorkflowKnowledgeRetrieverAdapter } from './workflow-knowledge-retriever.adapter.js';

describe('WorkflowKnowledgeRetrieverAdapter', () => {
  it('uses project-scoped KB config, embeds the query, and returns only scores above minScore', async () => {
    const findFirst = vi.fn(async () => ({ embeddingModelId: 'embed-1', embeddingDimensions: 2 }));
    const queryRaw = vi.fn(async () => [
      { chunkId: 'a', documentId: 'd1', documentName: 'Guide', chunkIndex: 0, content: 'answer', metadata: null, score: 0.9 },
      { chunkId: 'b', documentId: 'd1', documentName: 'Guide', chunkIndex: 1, content: 'weak', metadata: null, score: 0.1 },
    ]);
    const embedExisting = vi.fn(async () => ({ embeddings: [[0.1, 0.2]], dimensions: 2 }));
    const adapter = new WorkflowKnowledgeRetrieverAdapter(
      { knowledgeBase: { findFirst }, $queryRaw: queryRaw } as unknown as PrismaService,
      { embedExisting } as unknown as EmbeddingService,
    );

    const result = await adapter.retrieve({
      projectId: 'project-1', knowledgeBaseId: 'kb-1', query: '住宿多少？', topK: 8, minScore: 0.5,
    });

    expect(findFirst).toHaveBeenCalledWith({
      where: { id: 'kb-1', projectId: 'project-1' },
      select: { embeddingModelId: true, embeddingDimensions: true },
    });
    expect(embedExisting).toHaveBeenCalledWith('embed-1', ['住宿多少？']);
    expect(result.items).toEqual([expect.objectContaining({ chunkId: 'a', score: 0.9 })]);
  });

  it('makes a missing or foreign knowledge base a non-retryable node failure', async () => {
    const adapter = new WorkflowKnowledgeRetrieverAdapter(
      { knowledgeBase: { findFirst: vi.fn(async () => null) } } as unknown as PrismaService,
      {} as EmbeddingService,
    );

    await expect(adapter.retrieve({ projectId: 'project-1', knowledgeBaseId: 'foreign-kb', query: 'q' }))
      .rejects.toMatchObject({ code: 'KNOWLEDGE_BASE_NOT_FOUND', retryable: false });
  });
});
