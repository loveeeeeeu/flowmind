import { Injectable } from '@nestjs/common';
import type {
  KnowledgeRetrieverPort,
  WorkflowKnowledgeRetrieveInput,
  WorkflowKnowledgeRetrieveResult,
  WorkflowRetrievedKnowledgeChunk,
} from '@flowmind/workflow-core';
import { WorkflowExecutionError } from '@flowmind/workflow-core';
import { EmbeddingService } from '../embedding/embedding.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

const DEFAULT_TOP_K = 5;
const MAX_TOP_K = 20;

/**
 * Worker-side implementation of the core Port.  The database lookup always carries projectId:
 * even a tampered canvas cannot use a KnowledgeBase owned by another project.
 */
@Injectable()
export class WorkflowKnowledgeRetrieverAdapter implements KnowledgeRetrieverPort {
  constructor(
    private readonly prisma: PrismaService,
    private readonly embeddings: EmbeddingService,
  ) {}

  async retrieve(input: WorkflowKnowledgeRetrieveInput): Promise<WorkflowKnowledgeRetrieveResult> {
    const knowledgeBase = await this.prisma.knowledgeBase.findFirst({
      where: { id: input.knowledgeBaseId, projectId: input.projectId },
      select: { embeddingModelId: true, embeddingDimensions: true },
    });
    if (!knowledgeBase) {
      throw new WorkflowExecutionError(`Knowledge base ${input.knowledgeBaseId} not found`, {
        code: 'KNOWLEDGE_BASE_NOT_FOUND',
      });
    }
    if (!knowledgeBase.embeddingModelId) {
      throw new WorkflowExecutionError('Knowledge base requires an embedding model', {
        code: 'KNOWLEDGE_EMBEDDING_MODEL_REQUIRED',
      });
    }
    if (!knowledgeBase.embeddingDimensions) {
      throw new WorkflowExecutionError('Knowledge base embedding dimensions are not configured', {
        code: 'KNOWLEDGE_VECTOR_DIMENSION_MISMATCH',
      });
    }

    const embedded = await this.embeddings.embedExisting(knowledgeBase.embeddingModelId, [input.query]);
    if (embedded.dimensions !== knowledgeBase.embeddingDimensions) {
      throw new WorkflowExecutionError('Knowledge vector dimensions do not match query embedding dimensions', {
        code: 'KNOWLEDGE_VECTOR_DIMENSION_MISMATCH',
      });
    }

    const topK = Math.max(1, Math.min(input.topK ?? DEFAULT_TOP_K, MAX_TOP_K));
    const vector = embedded.embeddings[0];
    if (!vector) {
      throw new WorkflowExecutionError('Knowledge provider returned no query embedding', {
        code: 'INVALID_PROVIDER_RESPONSE',
      });
    }

    try {
      const items = await this.search({ ...input, topK, queryVector: vector });
      return { items: items.filter((item) => item.score >= (input.minScore ?? 0)) };
    } catch (error) {
      if (error instanceof WorkflowExecutionError) throw error;
      throw new WorkflowExecutionError('Knowledge vector search failed', {
        code: 'KNOWLEDGE_VECTOR_SEARCH_FAILED',
        cause: error,
      });
    }
  }

  private async search(input: WorkflowKnowledgeRetrieveInput & { queryVector: number[]; topK: number }) {
    const vectorLiteral = `[${input.queryVector.join(',')}]`;
    const rows = await this.prisma.$queryRaw<Array<WorkflowRetrievedKnowledgeChunk & { metadata: unknown }>>`
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
    // Keep the workflow retrieval contract small. In particular, never carry a raw embedding
    // into NodeRun output, logs, SSE, or the browser even if the query is changed later.
    return rows.map((row) => ({
      chunkId: row.chunkId,
      documentId: row.documentId,
      documentName: row.documentName,
      chunkIndex: row.chunkIndex,
      content: row.content,
      score: Number(row.score),
      metadata: row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata)
        ? row.metadata as Record<string, unknown>
        : null,
    }));
  }
}
