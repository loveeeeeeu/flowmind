import type { PrismaService } from '../prisma/prisma.service.js';
import { KnowledgeVectorSearchService } from './knowledge-vector-search.service.js';

describe('KnowledgeVectorSearchService', () => {
  it('scopes pgvector search to project and READY documents, and returns no embedding payload', async () => {
    const $queryRaw = vi.fn(async () => [{
      chunkId: 'chunk-1', documentId: 'document-1', documentName: 'HR Policies',
      chunkIndex: 0, content: 'Hotel reimbursement is capped at 600.', metadata: { startOffset: 0 }, score: 0.91,
      embedding: [0.1, 0.2],
    }]);
    const service = new KnowledgeVectorSearchService({ $queryRaw } as unknown as PrismaService);

    const result = await service.searchKnowledgeBase({
      projectId: 'project-a', knowledgeBaseId: 'kb-a', queryVector: [0.1, 0.2], topK: 3,
    });

    const [query, ...values] = $queryRaw.mock.calls[0] as [TemplateStringsArray, ...unknown[]];
    expect(query.join('')).toContain('kb."projectId" =');
    expect(query.join('')).toContain('d."status" = \'READY\'');
    expect(query.join('')).toContain('c."embedding" IS NOT NULL');
    expect(values).toEqual(expect.arrayContaining(['kb-a', 'project-a', 3]));
    expect(result).toEqual([expect.objectContaining({ chunkId: 'chunk-1', score: 0.91 })]);
    expect(JSON.stringify(result)).not.toContain('embedding');
  });

  it('rejects invalid vectors before issuing raw SQL', async () => {
    const $queryRaw = vi.fn();
    const service = new KnowledgeVectorSearchService({ $queryRaw } as unknown as PrismaService);

    await expect(service.searchKnowledgeBase({
      projectId: 'project-a', knowledgeBaseId: 'kb-a', queryVector: [Number.NaN], topK: 3,
    })).rejects.toThrow('Invalid query embedding vector');
    expect($queryRaw).not.toHaveBeenCalled();
  });
});
