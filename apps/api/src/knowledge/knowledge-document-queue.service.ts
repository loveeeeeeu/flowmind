import { InjectQueue } from '@nestjs/bullmq';
import { INGEST_DOCUMENT_JOB, type KnowledgeIngestionJobData, KNOWLEDGE_INGESTION_QUEUE } from '@flowmind/shared';
import { Injectable } from '@nestjs/common';
import type { Queue } from 'bullmq';

@Injectable()
export class KnowledgeDocumentQueueService {
  constructor(
    @InjectQueue(KNOWLEDGE_INGESTION_QUEUE)
    private readonly queue: Queue<KnowledgeIngestionJobData>,
  ) {}

  async enqueue(documentId: string) {
    // A failed BullMQ job remains stored by default. Remove it before a manual retry so the same
    // stable jobId really creates a new attempt; PENDING/PROCESSING retries are rejected above.
    const existing = await this.queue.getJob(documentId);
    if (existing) await existing.remove();
    return this.queue.add(INGEST_DOCUMENT_JOB, { documentId }, {
      jobId: documentId,
      attempts: 3,
      backoff: { type: 'exponential', delay: 1_000 },
    });
  }
}
