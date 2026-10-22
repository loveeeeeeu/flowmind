import { Injectable } from '@nestjs/common';
import { apiError } from '../common/api-error.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { CreateKnowledgeDocumentDto } from './dto/create-knowledge-document.dto.js';
import { KnowledgeDocumentQueueService } from './knowledge-document-queue.service.js';

const DOCUMENT_SUMMARY = {
  id: true,
  knowledgeBaseId: true,
  name: true,
  sourceType: true,
  status: true,
  errorCode: true,
  errorMessage: true,
  _count: { select: { chunks: true } },
  createdAt: true,
  updatedAt: true,
} as const;

@Injectable()
export class KnowledgeDocumentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queue: KnowledgeDocumentQueueService,
  ) {}

  async create(projectId: string, knowledgeBaseId: string, dto: CreateKnowledgeDocumentDto) {
    const knowledgeBase = await this.prisma.knowledgeBase.findFirst({
      where: { id: knowledgeBaseId, projectId },
      select: { id: true, embeddingModelId: true, enabled: true },
    });
    if (!knowledgeBase) throw knowledgeBaseNotFound(knowledgeBaseId);
    if (knowledgeBase.enabled === false) {
      throw apiError.badRequest('KNOWLEDGE_BASE_DISABLED', 'Knowledge base is disabled');
    }
    if (!knowledgeBase.embeddingModelId) {
      throw apiError.badRequest('KNOWLEDGE_EMBEDDING_MODEL_REQUIRED', 'Knowledge base requires an embedding model');
    }
    if (dto.sourceType === 'TEXT' && !dto.text?.trim()) {
      throw apiError.badRequest('KNOWLEDGE_TEXT_REQUIRED', 'Text content is required');
    }

    const document = await this.prisma.knowledgeDocument.create({
      data: {
        knowledgeBaseId,
        name: dto.name,
        sourceType: dto.sourceType,
        sourceText: dto.sourceType === 'TEXT' ? dto.text!.trim() : null,
        status: 'PENDING',
      },
      select: DOCUMENT_SUMMARY,
    });
    await this.queue.enqueue(document.id);
    return document;
  }

  findAll(projectId: string, knowledgeBaseId: string) {
    return this.prisma.knowledgeDocument.findMany({
      where: { knowledgeBaseId, knowledgeBase: { projectId } },
      select: DOCUMENT_SUMMARY,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(projectId: string, knowledgeBaseId: string, documentId: string) {
    const document = await this.prisma.knowledgeDocument.findFirst({
      where: { id: documentId, knowledgeBaseId, knowledgeBase: { projectId } },
      select: DOCUMENT_SUMMARY,
    });
    if (!document) throw documentNotFound(documentId);
    return document;
  }

  async findChunks(projectId: string, knowledgeBaseId: string, documentId: string) {
    await this.findOne(projectId, knowledgeBaseId, documentId);
    return this.prisma.knowledgeChunk.findMany({
      where: { documentId },
      select: { id: true, chunkIndex: true, content: true, tokenCount: true, metadata: true, createdAt: true },
      orderBy: { chunkIndex: 'asc' },
    });
  }

  async retry(projectId: string, knowledgeBaseId: string, documentId: string) {
    const document = await this.findOne(projectId, knowledgeBaseId, documentId);
    if (document.status !== 'FAILED') {
      throw apiError.conflict('DOCUMENT_NOT_FAILED', 'Only failed documents can be retried');
    }
    await this.prisma.knowledgeDocument.update({
      where: { id: document.id },
      data: { status: 'PENDING', errorCode: null, errorMessage: null },
    });
    await this.queue.enqueue(document.id);
  }

  async remove(projectId: string, knowledgeBaseId: string, documentId: string) {
    const document = await this.findOne(projectId, knowledgeBaseId, documentId);
    if (document.status === 'PROCESSING') {
      throw apiError.conflict('DOCUMENT_PROCESSING', 'Cannot delete a document while it is processing');
    }
    await this.prisma.knowledgeDocument.delete({ where: { id: document.id } });
  }
}

function knowledgeBaseNotFound(id: string) {
  return apiError.notFound('KNOWLEDGE_BASE_NOT_FOUND', `Knowledge base ${id} not found`);
}

function documentNotFound(id: string) {
  return apiError.notFound('KNOWLEDGE_DOCUMENT_NOT_FOUND', `Knowledge document ${id} not found`);
}
