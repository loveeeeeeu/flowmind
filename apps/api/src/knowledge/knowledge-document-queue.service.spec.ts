import { INGEST_DOCUMENT_JOB, KNOWLEDGE_INGESTION_QUEUE } from '@flowmind/shared';
import type { Queue } from 'bullmq';
import { KnowledgeDocumentQueueService } from './knowledge-document-queue.service.js';

describe('KnowledgeDocumentQueueService', () => {
  it('uses documentId as a stable BullMQ job id and replaces a retained failed job on retry', async () => {
    const remove = vi.fn(async () => undefined);
    const add = vi.fn(async () => undefined);
    const queue = { getJob: vi.fn(async () => ({ remove })), add } as unknown as Queue;
    const service = new KnowledgeDocumentQueueService(queue as Queue);

    await service.enqueue('document-1');

    expect(KNOWLEDGE_INGESTION_QUEUE).toBe('knowledge-ingestion');
    expect(remove).toHaveBeenCalled();
    expect(add).toHaveBeenCalledWith(INGEST_DOCUMENT_JOB, { documentId: 'document-1' }, expect.objectContaining({
      jobId: 'document-1', attempts: 3,
    }));
  });
});
