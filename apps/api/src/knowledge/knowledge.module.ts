import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { KNOWLEDGE_INGESTION_QUEUE } from '@flowmind/shared';
import { ProjectModule } from '../project/project.module.js';
import { KnowledgeController } from './knowledge.controller.js';
import { KnowledgeService } from './knowledge.service.js';
import { KnowledgeDocumentController } from './knowledge-document.controller.js';
import { KnowledgeDocumentQueueService } from './knowledge-document-queue.service.js';
import { KnowledgeDocumentService } from './knowledge-document.service.js';

@Module({
  imports: [ProjectModule, BullModule.registerQueue({ name: KNOWLEDGE_INGESTION_QUEUE })],
  controllers: [KnowledgeController, KnowledgeDocumentController],
  providers: [KnowledgeService, KnowledgeDocumentQueueService, KnowledgeDocumentService],
})
export class KnowledgeModule {}
