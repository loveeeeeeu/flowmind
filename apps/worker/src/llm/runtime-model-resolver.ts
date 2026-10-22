import { Injectable } from '@nestjs/common';
import { CredentialCrypto } from '@flowmind/shared';
import { WorkflowExecutionError } from '@flowmind/workflow-core';
import type { CredentialProvider } from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';

/**
 * Everything needed to call a model. apiKey is the decrypted secret: it lives only in memory for
 * the current call and must never be written to the database, a NodeRun, a log or the console.
 */
export interface ResolvedModelConfig {
  modelId: string;
  modelName: string;
  provider: CredentialProvider;
  baseUrl: string | null;
  apiKey: string;
  type: 'CHAT' | 'EMBEDDING';
  embeddingDimensions: number | null;
  enabled: boolean;
  supportsTemperature: boolean;
}

function resolutionError(code: string, message: string, cause?: unknown) {
  return new WorkflowExecutionError(message, { code, retryable: false, cause });
}

/**
 * modelId -> Model -> Credential -> decrypted secret, read fresh on every call so a rotated
 * secret or a revoked credential takes effect on the next run without republishing. Nothing is
 * cached: a cached secret would outlive its revocation.
 *
 * Model.enabled is deliberately not checked: disabling only hides a model from new nodes (the
 * api rejects it on publish / test run), published versions that use it keep running.
 */
@Injectable()
export class RuntimeModelResolver {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CredentialCrypto,
  ) {}

  async resolve(modelId: string): Promise<ResolvedModelConfig> {
    const model = await this.prisma.model.findUnique({
      where: { id: modelId },
      select: {
        id: true,
        modelName: true,
        type: true,
        embeddingDimensions: true,
        enabled: true,
        supportsTemperature: true,
        credential: {
          select: {
            provider: true,
            baseUrl: true,
            encryptedSecret: true,
            secretIv: true,
            secretAuthTag: true,
            revokedAt: true,
          },
        },
      },
    });

    if (!model) {
      throw resolutionError('MODEL_NOT_FOUND', `Model ${modelId} not found`);
    }

    const { credential } = model;

    if (credential.revokedAt) {
      throw resolutionError('CREDENTIAL_REVOKED', `Credential for model ${modelId} is revoked`);
    }

    let apiKey: string;

    try {
      apiKey = this.crypto.decrypt(credential);
    } catch (error) {
      throw resolutionError(
        'CREDENTIAL_DECRYPTION_ERROR',
        `Failed to decrypt the credential for model ${modelId}`,
        error,
      );
    }

    return {
      modelId: model.id,
      modelName: model.modelName,
      provider: credential.provider,
      baseUrl: credential.baseUrl,
      apiKey,
      type: model.type,
      embeddingDimensions: model.embeddingDimensions,
      enabled: model.enabled,
      supportsTemperature: model.supportsTemperature,
    };
  }

  async resolveChatModel(modelId: string): Promise<ResolvedModelConfig> {
    const model = await this.resolve(modelId);
    if (model.type !== 'CHAT') {
      throw resolutionError('MODEL_TYPE_MISMATCH', `Model ${modelId} is not a chat model`);
    }
    return model;
  }

  async resolveEmbeddingModel(modelId: string): Promise<ResolvedModelConfig> {
    const model = await this.resolveExistingEmbeddingModel(modelId);
    if (!model.enabled) {
      throw resolutionError('MODEL_DISABLED', `Embedding model ${modelId} is disabled`);
    }
    return model;
  }

  /** Published workflows and existing knowledge bases keep working after a model is disabled.
   * The caller must already have resolved the resource through a project-scoped knowledge base. */
  async resolveExistingEmbeddingModel(modelId: string): Promise<ResolvedModelConfig> {
    const model = await this.resolve(modelId);
    if (model.type !== 'EMBEDDING') {
      throw resolutionError('MODEL_TYPE_MISMATCH', `Model ${modelId} is not an embedding model`);
    }
    if (!model.embeddingDimensions || model.embeddingDimensions <= 0) {
      throw resolutionError('EMBEDDING_DIMENSIONS_MISSING', `Embedding model ${modelId} has no dimensions`);
    }
    return model;
  }
}
