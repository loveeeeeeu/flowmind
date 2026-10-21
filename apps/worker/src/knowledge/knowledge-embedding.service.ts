import { Injectable } from '@nestjs/common';
import { WorkflowExecutionError } from '@flowmind/workflow-core';
import { EmbeddingService } from '../embedding/embedding.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { KnowledgeVectorService } from './knowledge-vector.service.js';

function knowledgeError(code: string, message: string) {
  return new WorkflowExecutionError(message, { code, retryable: false });
}

/** Project/knowledge orchestration around the generic EmbeddingService. Document ingestion will
 * call this later; keeping it separate makes vector generation independently testable. */
@Injectable()
export class KnowledgeEmbeddingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly embeddings: EmbeddingService,
    private readonly vectors: KnowledgeVectorService,
  ) {}

  async embedChunks(projectId: string, knowledgeBaseId: string, chunkIds: string[]) {
    if (chunkIds.length === 0) {
      return { count: 0, dimensions: 0 };
    }

    const knowledgeBase = await this.prisma.knowledgeBase.findFirst({
      where: { id: knowledgeBaseId, projectId },
      select: { embeddingModelId: true },
    });

    if (!knowledgeBase) {
      throw knowledgeError('KNOWLEDGE_BASE_NOT_FOUND', `Knowledge base ${knowledgeBaseId} not found`);
    }
    if (!knowledgeBase.embeddingModelId) {
      throw knowledgeError('KNOWLEDGE_EMBEDDING_MODEL_REQUIRED', 'Knowledge base requires an embedding model');
    }

    const chunks = await this.prisma.knowledgeChunk.findMany({
      where: { id: { in: chunkIds }, document: { knowledgeBaseId, knowledgeBase: { projectId } } },
      select: { id: true, content: true },
    });
    const chunksById = new Map(chunks.map((chunk) => [chunk.id, chunk]));
    const ordered = chunkIds.map((id) => chunksById.get(id));
    if (ordered.some((chunk) => !chunk)) {
      throw knowledgeError('KNOWLEDGE_CHUNK_NOT_FOUND', 'One or more knowledge chunks were not found');
    }

    const resolved = ordered as Array<{ id: string; content: string }>;
    const result = await this.embeddings.embed(knowledgeBase.embeddingModelId, resolved.map((chunk) => chunk.content));
    for (let index = 0; index < resolved.length; index += 1) {
      await this.vectors.writeEmbedding(resolved[index].id, result.embeddings[index]);
    }

    return { count: resolved.length, dimensions: result.dimensions };
  }
}
