import type { PrismaService } from '../prisma/prisma.service.js';
import type { EmbeddingService } from '../embedding/embedding.service.js';
import type { KnowledgeVectorService } from './knowledge-vector.service.js';
import { KnowledgeEmbeddingService } from './knowledge-embedding.service.js';

function setup({ modelId = 'embed-1', chunks = [{ id: 'chunk-2', content: 'second' }, { id: 'chunk-1', content: 'first' }] } = {}) {
  const findFirst = vi.fn(async () => modelId ? { embeddingModelId: modelId } : null);
  const findMany = vi.fn(async () => chunks);
  const embed = vi.fn(async () => ({ embeddings: [[1, 2], [3, 4]], dimensions: 2 }));
  const writeEmbedding = vi.fn(async () => undefined);
  const service = new KnowledgeEmbeddingService(
    { knowledgeBase: { findFirst }, knowledgeChunk: { findMany } } as unknown as PrismaService,
    { embed } as unknown as EmbeddingService,
    { writeEmbedding } as unknown as KnowledgeVectorService,
  );
  return { service, findMany, embed, writeEmbedding };
}

describe('KnowledgeEmbeddingService', () => {
  it('keeps caller chunk order for both inputs and vector writes', async () => {
    const { service, embed, writeEmbedding } = setup();
    await expect(service.embedChunks('project-1', 'kb-1', ['chunk-1', 'chunk-2']))
      .resolves.toEqual({ count: 2, dimensions: 2 });
    expect(embed).toHaveBeenCalledWith('embed-1', ['first', 'second']);
    expect(writeEmbedding).toHaveBeenNthCalledWith(1, 'chunk-1', [1, 2]);
    expect(writeEmbedding).toHaveBeenNthCalledWith(2, 'chunk-2', [3, 4]);
  });

  it('does not call the provider when a selected chunk is outside the knowledge base', async () => {
    const { service, embed } = setup({ chunks: [{ id: 'chunk-1', content: 'first' }] });
    await expect(service.embedChunks('project-1', 'kb-1', ['chunk-1', 'other']))
      .rejects.toMatchObject({ code: 'KNOWLEDGE_CHUNK_NOT_FOUND', retryable: false });
    expect(embed).not.toHaveBeenCalled();
  });
});
