import { Injectable } from '@nestjs/common';
import type { WorkflowCanvas } from '@flowmind/workflow-core';
import { apiError } from '../common/api-error.js';
import { PrismaService } from '../prisma/prisma.service.js';

/**
 * Checks what static validation cannot: that the resources a canvas references exist and may be
 * used. Runs after static validation, so every LLM node already has a non-empty string modelId.
 *
 * Only for new executions of the editor's canvas (publish, test run). A published version that
 * references a model disabled later still runs; a revoked credential fails at run time instead.
 *
 * The projectId parameter enforces isolation: a model belonging to a different project's
 * credential is treated as not found (MODEL_NOT_FOUND, not a 403) to prevent existence probing.
 */
@Injectable()
export class WorkflowResourceValidator {
  constructor(private readonly prisma: PrismaService) {}

  async validateForDraft(projectId: string, canvas: WorkflowCanvas) {
    const llmNodes = canvas.nodes
      .filter((node) => node.type === 'llm')
      .map((node) => ({ nodeId: node.id, modelId: node.data.modelId as string }));

    const retrieverNodes = canvas.nodes
      .filter((node) => node.type === 'knowledgeRetriever')
      .map((node) => ({ nodeId: node.id, knowledgeBaseId: node.data.knowledgeBaseId as string }));

    // One query however many nodes share a model.
    // The credential.projectId join enforces project isolation: a modelId from another
    // project simply returns no row → MODEL_NOT_FOUND (not 403).
    const models = llmNodes.length === 0 ? [] : await this.prisma.model.findMany({
      where: {
        id: { in: [...new Set(llmNodes.map((node) => node.modelId))] },
        credential: { projectId },
      },
      select: { id: true, enabled: true, credential: { select: { revokedAt: true } } },
    });
    const modelsById = new Map(models.map((model) => [model.id, model]));

    for (const { nodeId, modelId } of llmNodes) {
      const model = modelsById.get(modelId);

      if (!model) {
        throw apiError.badRequest(
          'MODEL_NOT_FOUND',
          `LLM node ${nodeId} references model ${modelId}, which does not exist`,
        );
      }

      if (!model.enabled) {
        throw apiError.badRequest(
          'MODEL_DISABLED',
          `LLM node ${nodeId} uses a disabled model; select another model`,
        );
      }

      if (model.credential.revokedAt) {
        throw apiError.badRequest(
          'CREDENTIAL_REVOKED',
          `LLM node ${nodeId} uses a model whose credential is revoked; select another model`,
        );
      }
    }

    if (retrieverNodes.length === 0) return;

    // Bulk check, scoped by project. A foreign ID therefore looks exactly like a missing ID.
    const knowledgeBases = await this.prisma.knowledgeBase.findMany({
      where: {
        id: { in: [...new Set(retrieverNodes.map((node) => node.knowledgeBaseId))] },
        projectId,
      },
      select: { id: true, enabled: true, embeddingModelId: true, embeddingDimensions: true },
    });
    const knowledgeBasesById = new Map(knowledgeBases.map((knowledgeBase) => [knowledgeBase.id, knowledgeBase]));

    for (const { nodeId, knowledgeBaseId } of retrieverNodes) {
      const knowledgeBase = knowledgeBasesById.get(knowledgeBaseId);
      if (!knowledgeBase) {
        throw apiError.badRequest(
          'KNOWLEDGE_BASE_NOT_FOUND',
          `Retriever node ${nodeId} references knowledge base ${knowledgeBaseId}, which does not exist`,
        );
      }
      if (!knowledgeBase.enabled) {
        throw apiError.badRequest('KNOWLEDGE_BASE_DISABLED', `Retriever node ${nodeId} uses a disabled knowledge base`);
      }
      if (!knowledgeBase.embeddingModelId || !knowledgeBase.embeddingDimensions) {
        throw apiError.badRequest(
          'KNOWLEDGE_EMBEDDING_MODEL_REQUIRED',
          `Retriever node ${nodeId} uses a knowledge base without a configured embedding model`,
        );
      }
    }
  }
}
