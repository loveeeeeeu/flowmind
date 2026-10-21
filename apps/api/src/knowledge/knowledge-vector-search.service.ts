import { Injectable } from '@nestjs/common';
import type { RetrievedKnowledgeChunk } from '@flowmind/shared';
import { PrismaService } from '../prisma/prisma.service.js';

export interface KnowledgeVectorSearchInput {
  projectId: string;
  knowledgeBaseId: string;
  queryVector: number[];
  topK: number;
}

@Injectable()
export class KnowledgeVectorSearchService {
  constructor(private readonly prisma: PrismaService) {}

  async searchKnowledgeBase(input: KnowledgeVectorSearchInput): Promise<RetrievedKnowledgeChunk[]> {
    if (input.queryVector.length === 0 || !input.queryVector.every((value) => Number.isFinite(value))) {
      throw new Error('Invalid query embedding vector');
    }
    const vectorLiteral = `[${input.queryVector.join(',')}]`;
    const rows = await this.prisma.$queryRaw<Array<{
      chunkId: string; documentId: string; documentName: string; chunkIndex: number;
      content: string; metadata: unknown; score: number;
    }>>`
      SELECT c."id" AS "chunkId", d."id" AS "documentId", d."name" AS "documentName",
             c."chunkIndex" AS "chunkIndex", c."content" AS "content", c."metadata" AS "metadata",
             1 - (c."embedding" <=> ${vectorLiteral}::vector) AS "score"
      FROM "KnowledgeChunk" c
      INNER JOIN "KnowledgeDocument" d ON d."id" = c."documentId"
      INNER JOIN "KnowledgeBase" kb ON kb."id" = d."knowledgeBaseId"
      WHERE kb."id" = ${input.knowledgeBaseId}
        AND kb."projectId" = ${input.projectId}
        AND d."status" = 'READY'
        AND c."embedding" IS NOT NULL
      ORDER BY c."embedding" <=> ${vectorLiteral}::vector
      LIMIT ${input.topK}
    `;
    return rows.map((row) => ({
      ...row,
      score: Number(row.score),
      metadata: row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata)
        ? row.metadata as Record<string, unknown>
        : null,
    }));
  }
}
