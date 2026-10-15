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
 */
@Injectable()
export class WorkflowResourceValidator {
  constructor(private readonly prisma: PrismaService) {}

  async validateForDraft(canvas: WorkflowCanvas) {
    const llmNodes = canvas.nodes
      .filter((node) => node.type === 'llm')
      .map((node) => ({ nodeId: node.id, modelId: node.data.modelId as string }));

    if (llmNodes.length === 0) {
      return;
    }

    // One query however many nodes share a model.
    const models = await this.prisma.model.findMany({
      where: { id: { in: [...new Set(llmNodes.map((node) => node.modelId))] } },
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
  }
}
