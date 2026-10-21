import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { INGEST_DOCUMENT_JOB, type KnowledgeIngestionJobData, KNOWLEDGE_INGESTION_QUEUE } from '@flowmind/shared';
import { Logger } from '@nestjs/common';
import { type Job, UnrecoverableError } from 'bullmq';
import { normalizeKnowledgeError } from './knowledge-ingestion.error.js';
import { KnowledgeIngestionService } from './knowledge-ingestion.service.js';

@Processor(KNOWLEDGE_INGESTION_QUEUE, { concurrency: 1 })
export class KnowledgeIngestionProcessor extends WorkerHost {
  private readonly logger = new Logger(KnowledgeIngestionProcessor.name);

  constructor(private readonly ingestion: KnowledgeIngestionService) { super(); }

  async process(job: Job<KnowledgeIngestionJobData>) {
    if (job.name !== INGEST_DOCUMENT_JOB) throw new Error(`Unsupported job: ${job.name}`);
    try {
      await this.ingestion.ingest(job.data.documentId);
    } catch (error) {
      const normalized = normalizeKnowledgeError(error);
      if (!normalized.retryable) throw new UnrecoverableError(normalized.message);
      throw error;
    }
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job<KnowledgeIngestionJobData> | undefined, error: Error) {
    this.logger.warn(`Knowledge document ${job?.data.documentId ?? 'unknown'} failed: ${error.message}`);
  }
}
