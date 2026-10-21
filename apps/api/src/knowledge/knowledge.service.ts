import { Injectable } from '@nestjs/common';
import { apiError } from '../common/api-error.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { CreateKnowledgeBaseDto } from './dto/create-knowledge-base.dto.js';
import type { UpdateKnowledgeBaseDto } from './dto/update-knowledge-base.dto.js';

const EMBEDDING_MODEL_SUMMARY = {
  id: true,
  name: true,
  modelName: true,
  embeddingDimensions: true,
} as const;

const KNOWLEDGE_BASE_SUMMARY = {
  id: true,
  projectId: true,
  name: true,
  description: true,
  embeddingModelId: true,
  embeddingModel: { select: EMBEDDING_MODEL_SUMMARY },
  _count: { select: { documents: true } },
  createdAt: true,
  updatedAt: true,
} as const;

@Injectable()
export class KnowledgeService {
  constructor(private readonly prisma: PrismaService) {}

  async create(projectId: string, dto: CreateKnowledgeBaseDto) {
    if (dto.embeddingModelId) {
      await this.assertEmbeddingModel(projectId, dto.embeddingModelId);
    }

    return this.prisma.knowledgeBase.create({
      data: {
        projectId,
        name: dto.name,
        description: dto.description,
        embeddingModelId: dto.embeddingModelId,
      },
      select: KNOWLEDGE_BASE_SUMMARY,
    });
  }

  findAll(projectId: string) {
    return this.prisma.knowledgeBase.findMany({
      where: { projectId },
      orderBy: { createdAt: 'desc' },
      select: KNOWLEDGE_BASE_SUMMARY,
    });
  }

  async findOne(projectId: string, id: string) {
    const knowledgeBase = await this.prisma.knowledgeBase.findFirst({
      where: { id, projectId },
      select: KNOWLEDGE_BASE_SUMMARY,
    });

    if (!knowledgeBase) {
      throw knowledgeBaseNotFound(id);
    }

    return knowledgeBase;
  }

  async update(projectId: string, id: string, dto: UpdateKnowledgeBaseDto) {
    const existing = await this.findOne(projectId, id);

    if (dto.embeddingModelId) {
      await this.assertEmbeddingModel(projectId, dto.embeddingModelId);
    }

    if (dto.embeddingModelId !== undefined && dto.embeddingModelId !== existing.embeddingModelId) {
      const chunkCount = await this.prisma.knowledgeChunk.count({
        where: { document: { knowledgeBaseId: id } },
      });
      if (chunkCount > 0) {
        throw apiError.conflict(
          'KNOWLEDGE_REEMBED_REQUIRED',
          'Cannot change the embedding model after chunks have been embedded; re-embed first',
        );
      }
    }

    return this.prisma.knowledgeBase.update({
      where: { id },
      data: {
        name: dto.name,
        description: dto.description,
        embeddingModelId: dto.embeddingModelId,
      },
      select: KNOWLEDGE_BASE_SUMMARY,
    });
  }

  async remove(projectId: string, id: string) {
    const result = await this.prisma.knowledgeBase.deleteMany({ where: { id, projectId } });

    if (result.count === 0) {
      throw knowledgeBaseNotFound(id);
    }
  }

  /** Never expose whether a model id belongs to another project: both cases are a 404. */
  private async assertEmbeddingModel(projectId: string, id: string) {
    const model = await this.prisma.model.findFirst({
      where: {
        id,
        type: 'EMBEDDING',
        enabled: true,
        embeddingDimensions: { not: null },
        credential: { projectId, revokedAt: null },
      },
      select: { id: true },
    });

    if (!model) {
      throw apiError.notFound('EMBEDDING_MODEL_NOT_FOUND', 'Embedding model not found');
    }
  }
}

function knowledgeBaseNotFound(id: string) {
  return apiError.notFound('KNOWLEDGE_BASE_NOT_FOUND', `Knowledge base ${id} not found`);
}
