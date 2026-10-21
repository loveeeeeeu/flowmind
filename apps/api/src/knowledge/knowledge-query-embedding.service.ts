import { Injectable } from '@nestjs/common';
import { LlmProviderError, ProviderRegistry, resolveProviderBaseUrl } from '@flowmind/shared';
import { apiError, type ApiErrorCode } from '../common/api-error.js';
import { CredentialCryptoService } from '../credential/credential-crypto.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

const UPSTREAM_CODES = new Set<string>([
  'AUTH_ERROR', 'RATE_LIMIT', 'INSUFFICIENT_BALANCE', 'INVALID_REQUEST', 'ENDPOINT_NOT_FOUND',
  'PROVIDER_UNAVAILABLE', 'INVALID_PROVIDER_RESPONSE', 'NETWORK_ERROR',
]);

/** Query embedding is an API read path. Unlike ingestion it intentionally permits a disabled
 * model for an existing knowledge base, while still rejecting revoked credentials. */
@Injectable()
export class KnowledgeQueryEmbeddingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CredentialCryptoService,
    private readonly registry: ProviderRegistry,
  ) {}

  async embed(projectId: string, modelId: string, query: string) {
    const model = await this.prisma.model.findFirst({
      where: { id: modelId, type: 'EMBEDDING', credential: { projectId } },
      select: {
        id: true, modelName: true, embeddingDimensions: true,
        credential: { select: { provider: true, baseUrl: true, encryptedSecret: true, secretIv: true, secretAuthTag: true, revokedAt: true } },
      },
    });
    if (!model) throw apiError.notFound('EMBEDDING_MODEL_NOT_FOUND', 'Embedding model not found');
    if (model.credential.revokedAt) throw apiError.badRequest('CREDENTIAL_REVOKED', 'Credential has been revoked');
    if (!model.embeddingDimensions || model.embeddingDimensions <= 0) {
      throw apiError.internal('KNOWLEDGE_VECTOR_DIMENSION_MISMATCH', 'Embedding model dimensions are not configured');
    }

    let apiKey: string;
    try {
      apiKey = this.crypto.decrypt(model.credential);
    } catch {
      throw apiError.internal('CREDENTIAL_DECRYPTION_ERROR', 'Stored secret cannot be decrypted');
    }

    try {
      const result = await this.registry.getEmbeddingProvider(model.credential.provider).embed({
        baseUrl: resolveProviderBaseUrl(model.credential), apiKey, model: model.modelName, texts: [query],
      });
      const vector = result.embeddings[0];
      if (result.embeddings.length !== 1 || !vector || result.dimensions !== model.embeddingDimensions || vector.length !== model.embeddingDimensions) {
        throw apiError.internal('KNOWLEDGE_VECTOR_DIMENSION_MISMATCH', 'Query embedding dimensions do not match the knowledge model');
      }
      return { vector, dimensions: result.dimensions };
    } catch (error) {
      if (!(error instanceof LlmProviderError)) throw error;
      if (error.code === 'TIMEOUT') throw apiError.gatewayTimeout('TIMEOUT', error.message);
      if (error.code === 'CREDENTIAL_BASE_URL_REQUIRED' || error.code === 'PROVIDER_NOT_SUPPORTED') {
        throw apiError.badRequest(error.code, error.message);
      }
      throw apiError.badGateway(UPSTREAM_CODES.has(error.code) ? error.code as ApiErrorCode : 'PROVIDER_ERROR', error.message);
    }
  }
}
