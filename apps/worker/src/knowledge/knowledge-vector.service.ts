import { Injectable } from '@nestjs/common';
import { WorkflowExecutionError } from '@flowmind/workflow-core';
import { PrismaService } from '../prisma/prisma.service.js';

function invalidVector(message: string) {
  return new WorkflowExecutionError(message, { code: 'INVALID_EMBEDDING_VECTOR', retryable: false });
}

/** Prisma cannot yet write its Unsupported("vector") field. Keep the raw SQL narrow and
 * parameterised: only a validated vector literal and chunk id are passed as query values. */
@Injectable()
export class KnowledgeVectorService {
  constructor(private readonly prisma: PrismaService) {}

  async writeEmbedding(chunkId: string, vector: number[]): Promise<void> {
    if (vector.length === 0 || !vector.every((value) => typeof value === 'number' && Number.isFinite(value))) {
      throw invalidVector('Embedding vector must contain only finite numbers');
    }

    const vectorLiteral = `[${vector.join(',')}]`;
    await this.prisma.$executeRaw`
      UPDATE "KnowledgeChunk"
      SET "embedding" = ${vectorLiteral}::vector
      WHERE "id" = ${chunkId}
    `;
  }
}
