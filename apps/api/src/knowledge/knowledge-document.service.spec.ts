import { apiError } from '../common/api-error.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { KnowledgeDocumentQueueService } from './knowledge-document-queue.service.js';
import { KnowledgeDocumentService } from './knowledge-document.service.js';

function setup({ knowledgeBase = { id: 'kb-1', embeddingModelId: 'embed-1' } as { id: string; embeddingModelId: string | null } | null, status = 'FAILED' } = {}) {
  const enqueue = vi.fn(async () => undefined);
  const findFirst = vi.fn(async () => knowledgeBase);
  const create = vi.fn(async () => ({ id: 'doc-1' }));
  const documentFindFirst = vi.fn(async () => ({ id: 'doc-1', status }));
  const update = vi.fn(async () => ({}));
  const service = new KnowledgeDocumentService(
    { knowledgeBase: { findFirst }, knowledgeDocument: { create, findFirst: documentFindFirst, update, delete: vi.fn() }, knowledgeChunk: { findMany: vi.fn() } } as unknown as PrismaService,
    { enqueue } as unknown as KnowledgeDocumentQueueService,
  );
  return { service, create, enqueue, update };
}

describe('KnowledgeDocumentService', () => {
  it('creates a PENDING TEXT document then enqueues only its id', async () => {
    const { service, create, enqueue } = setup();
    await service.create('project-1', 'kb-1', { name: 'Guide', sourceType: 'TEXT', text: ' hello ' });
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'PENDING', sourceText: 'hello' }) }));
    expect(enqueue).toHaveBeenCalledWith('doc-1');
  });

  it('requires a configured embedding model and text for a TEXT document', async () => {
    await expect(setup({ knowledgeBase: { id: 'kb-1', embeddingModelId: null } }).service.create('project-1', 'kb-1', { name: 'Guide', sourceType: 'TEXT', text: 'hello' }))
      .rejects.toThrow(apiError.badRequest('KNOWLEDGE_EMBEDDING_MODEL_REQUIRED', 'Knowledge base requires an embedding model'));
    await expect(setup().service.create('project-1', 'kb-1', { name: 'Guide', sourceType: 'TEXT' }))
      .rejects.toThrow(apiError.badRequest('KNOWLEDGE_TEXT_REQUIRED', 'Text content is required'));
  });

  it('only retries a failed document', async () => {
    const { service, update, enqueue } = setup();
    await service.retry('project-1', 'kb-1', 'doc-1');
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'PENDING' }) }));
    expect(enqueue).toHaveBeenCalledWith('doc-1');
    await expect(setup({ status: 'READY' }).service.retry('project-1', 'kb-1', 'doc-1'))
      .rejects.toThrow(apiError.conflict('DOCUMENT_NOT_FAILED', 'Only failed documents can be retried'));
  });
});
