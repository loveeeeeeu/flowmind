import { Injectable, Logger } from '@nestjs/common';
import { type KnowledgeRetrieveInput, type KnowledgeRetrieveResult } from '@flowmind/shared';
import { apiError } from '../common/api-error.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { KnowledgeQueryEmbeddingService } from './knowledge-query-embedding.service.js';
import { KnowledgeVectorSearchService } from './knowledge-vector-search.service.js';

const DEFAULT_TOP_K = 5;
const MAX_TOP_K = 20;

@Injectable()
export class KnowledgeRetrieverService {
  private readonly logger = new Logger(KnowledgeRetrieverService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly embeddings: KnowledgeQueryEmbeddingService,
    private readonly vectors: KnowledgeVectorSearchService,
  ) {}

  async retrieve(input: KnowledgeRetrieveInput): Promise<KnowledgeRetrieveResult> {
    const query = input.query.trim();
    if (!query) throw apiError.badRequest('KNOWLEDGE_QUERY_REQUIRED', 'Knowledge query is required');
    const knowledgeBase = await this.prisma.knowledgeBase.findFirst({
      where: { id: input.knowledgeBaseId, projectId: input.projectId },
      select: { embeddingModelId: true, embeddingDimensions: true },
    });
    if (!knowledgeBase) throw apiError.notFound('KNOWLEDGE_BASE_NOT_FOUND', `Knowledge base ${input.knowledgeBaseId} not found`);
    if (!knowledgeBase.embeddingModelId) {
      throw apiError.badRequest('KNOWLEDGE_EMBEDDING_MODEL_REQUIRED', 'Knowledge base requires an embedding model');
    }
    if (!knowledgeBase.embeddingDimensions) {
      throw apiError.internal('KNOWLEDGE_VECTOR_DIMENSION_MISMATCH', 'Knowledge base embedding dimensions are not configured');
    }

    const topK = Math.max(1, Math.min(input.topK ?? DEFAULT_TOP_K, MAX_TOP_K));
    const embedded = await this.embeddings.embed(input.projectId, knowledgeBase.embeddingModelId, query);
    if (embedded.dimensions !== knowledgeBase.embeddingDimensions) {
      throw apiError.internal('KNOWLEDGE_VECTOR_DIMENSION_MISMATCH', 'Knowledge vector dimensions do not match query embedding dimensions');
    }

    try {
      const results = await this.vectors.searchKnowledgeBase({
        projectId: input.projectId, knowledgeBaseId: input.knowledgeBaseId,
        queryVector: embedded.vector, topK,
      });
      return { query, topK, items: results.filter((item) => item.score >= (input.minScore ?? 0)) };
    } catch (error) {
      this.logger.error('Knowledge vector search failed', error instanceof Error ? error.stack : undefined);
      throw apiError.internal('KNOWLEDGE_VECTOR_SEARCH_FAILED', 'Knowledge search failed');
    }
  }
}
