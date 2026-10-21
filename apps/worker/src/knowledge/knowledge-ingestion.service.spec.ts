import type { EmbeddingService } from '../embedding/embedding.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { KnowledgeVectorService } from './knowledge-vector.service.js';
import { DocumentTextExtractor } from './document-text-extractor.service.js';
import { KnowledgeIngestionService } from './knowledge-ingestion.service.js';
import { TextChunker } from './text-chunker.service.js';

function setup({ text = 'alpha beta gamma delta epsilon zeta', embedError }: { text?: string; embedError?: Error } = {}) {
  const updateMany = vi.fn()
    .mockResolvedValueOnce({ count: 1 })
    .mockResolvedValue({ count: 1 });
  const findUnique = vi.fn(async () => ({
    id: 'document-1', sourceType: 'TEXT', sourceText: text,
    knowledgeBase: { embeddingModelId: 'embedding-1' },
  }));
  const chunks = [{ id: 'chunk-0', content: 'alpha beta' }, { id: 'chunk-1', content: 'gamma delta' }];
  const createMany = vi.fn(async ({ data }: { data: Array<{ content: string }> }) => {
    chunks.splice(0, chunks.length, ...data.map((item, index) => ({ id: `chunk-${index}`, content: item.content })));
  });
  const findMany = vi.fn(async () => chunks);
  const embed = vi.fn(async () => {
    if (embedError) throw embedError;
    return { embeddings: chunks.map(() => [0.1, 0.2]), dimensions: 2 };
  });
  const writeEmbedding = vi.fn(async () => undefined);
  const service = new KnowledgeIngestionService(
    {
      knowledgeDocument: { updateMany, findUnique },
      knowledgeChunk: { deleteMany: vi.fn(async () => ({ count: 0 })), createMany, findMany },
    } as unknown as PrismaService,
    new DocumentTextExtractor(), new TextChunker(12, 2),
    { embed } as unknown as EmbeddingService,
    { writeEmbedding } as unknown as KnowledgeVectorService,
  );
  return { service, updateMany, createMany, embed, writeEmbedding };
}

describe('KnowledgeIngestionService', () => {
  it('claims, chunks, batch-embeds, writes vectors, then marks the document READY', async () => {
    const { service, updateMany, createMany, writeEmbedding } = setup();
    await expect(service.ingest('document-1')).resolves.toBe('processed');
    expect(createMany).toHaveBeenCalled();
    expect(writeEmbedding).toHaveBeenCalled();
    expect(updateMany).toHaveBeenLastCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'READY' }) }));
  });

  it('marks FAILED and retains no READY status when embedding fails', async () => {
    const timeout = Object.assign(new Error('timeout'), { code: 'TIMEOUT', retryable: true });
    const { service, updateMany } = setup({ embedError: timeout });
    await expect(service.ingest('document-1')).rejects.toBe(timeout);
    expect(updateMany).toHaveBeenLastCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'FAILED', errorCode: 'TIMEOUT' }) }));
  });
});
