import { Injectable } from '@nestjs/common';
import { ProviderRegistry, resolveProviderBaseUrl } from '@flowmind/shared';
import { WorkflowExecutionError } from '@flowmind/workflow-core';
import { RuntimeModelResolver } from '../llm/runtime-model-resolver.js';

export interface EmbedTextsResult {
  embeddings: number[][];
  dimensions: number;
}

function embeddingError(code: string, message: string) {
  return new WorkflowExecutionError(message, { code, retryable: false });
}

/** Runtime-only embedding port. It resolves a model afresh, just like chat calls, so revocation
 * and credential rotation take effect immediately. It intentionally knows nothing about chunks. */
@Injectable()
export class EmbeddingService {
  constructor(
    private readonly resolver: RuntimeModelResolver,
    private readonly registry: ProviderRegistry,
  ) {}

  async embed(modelId: string, texts: string[]): Promise<EmbedTextsResult> {
    if (texts.length === 0) {
      return { embeddings: [], dimensions: 0 };
    }

    const model = await this.resolver.resolveEmbeddingModel(modelId);
    return this.embedWithModel(model, texts);
  }

  /** Retrieval is historical runtime, so a disabled (but not revoked) embedding model is valid. */
  async embedExisting(modelId: string, texts: string[]): Promise<EmbedTextsResult> {
    if (texts.length === 0) return { embeddings: [], dimensions: 0 };
    const model = await this.resolver.resolveExistingEmbeddingModel(modelId);
    return this.embedWithModel(model, texts);
  }

  private async embedWithModel(
    model: Awaited<ReturnType<RuntimeModelResolver['resolveEmbeddingModel']>>,
    texts: string[],
  ): Promise<EmbedTextsResult> {
    const result = await this.registry.getEmbeddingProvider(model.provider).embed({
      baseUrl: resolveProviderBaseUrl(model),
      apiKey: model.apiKey,
      model: model.modelName,
      texts,
    });

    if (result.embeddings.length !== texts.length) {
      throw embeddingError('INVALID_PROVIDER_RESPONSE', 'Embedding result count does not match input count');
    }

    if (result.dimensions !== model.embeddingDimensions) {
      throw embeddingError('EMBEDDING_DIMENSION_MISMATCH', 'Embedding dimensions do not match the configured model');
    }
    for (const vector of result.embeddings) {
      if (vector.length !== model.embeddingDimensions) {
        throw embeddingError('EMBEDDING_DIMENSION_MISMATCH', 'Embedding dimensions do not match the configured model');
      }
      if (!vector.every((value) => typeof value === 'number' && Number.isFinite(value))) {
        throw embeddingError('INVALID_PROVIDER_RESPONSE', 'Embedding provider returned a non-finite vector value');
      }
    }

    return { embeddings: result.embeddings, dimensions: result.dimensions };
  }
}
