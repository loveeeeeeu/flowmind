import type { Job } from 'bullmq';
import { KnowledgeIngestionProcessor } from './knowledge-ingestion.processor.js';
import type { KnowledgeIngestionService } from './knowledge-ingestion.service.js';

function job(attemptsMade: number, attempts = 3) {
  return {
    name: 'ingest-document',
    data: { documentId: 'document-1' },
    attemptsMade,
    opts: { attempts },
  } as unknown as Job<{ documentId: string }>;
}

describe('KnowledgeIngestionProcessor', () => {
  it('returns a retryable failed document to PENDING before BullMQ schedules another attempt', async () => {
    const retryable = Object.assign(new Error('temporary provider outage'), { code: 'PROVIDER_UNAVAILABLE', retryable: true });
    const ingestion = {
      ingest: vi.fn(async () => { throw retryable; }),
      requeueForRetry: vi.fn(async () => ({ count: 1 })),
    } as unknown as KnowledgeIngestionService;
    const processor = new KnowledgeIngestionProcessor(ingestion);

    await expect(processor.process(job(0))).rejects.toBe(retryable);
    expect(ingestion.requeueForRetry).toHaveBeenCalledWith('document-1');
  });

  it('keeps the final failed attempt FAILED instead of scheduling another PENDING transition', async () => {
    const retryable = Object.assign(new Error('temporary provider outage'), { code: 'PROVIDER_UNAVAILABLE', retryable: true });
    const ingestion = {
      ingest: vi.fn(async () => { throw retryable; }),
      requeueForRetry: vi.fn(async () => ({ count: 1 })),
    } as unknown as KnowledgeIngestionService;
    const processor = new KnowledgeIngestionProcessor(ingestion);

    await expect(processor.process(job(2))).rejects.toBe(retryable);
    expect(ingestion.requeueForRetry).not.toHaveBeenCalled();
  });
});
