import { Injectable, Logger } from '@nestjs/common';
import {
  LlmProviderError,
  ProviderRegistry,
  resolveProviderBaseUrl,
  type LlmProvider,
  type ProviderConnection,
  type RemoteModelInfo,
} from '@flowmind/shared';
import { apiError, type ApiErrorCode } from '../common/api-error.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { CredentialCryptoService } from './credential-crypto.service.js';

export interface RemoteModel extends RemoteModelInfo {
  /** A local model with this modelName already exists under the credential. */
  imported: boolean;
}

const UPSTREAM_ERROR_CODES = new Set<string>([
  'AUTH_ERROR',
  'RATE_LIMIT',
  'INSUFFICIENT_BALANCE',
  'INVALID_REQUEST',
  'ENDPOINT_NOT_FOUND',
  'PROVIDER_UNAVAILABLE',
  'INVALID_PROVIDER_RESPONSE',
  'NETWORK_ERROR',
]);

/** Provider failures become stable API errors: 400 for configuration, 502/504 for the upstream. */
function toApiError(error: unknown) {
  if (!(error instanceof LlmProviderError)) {
    return error;
  }

  switch (error.code) {
    case 'CREDENTIAL_BASE_URL_REQUIRED':
    case 'PROVIDER_NOT_SUPPORTED':
      return apiError.badRequest(error.code, error.message);
    case 'TIMEOUT':
      return apiError.gatewayTimeout('TIMEOUT', error.message);
    default:
      return apiError.badGateway(
        UPSTREAM_ERROR_CODES.has(error.code) ? (error.code as ApiErrorCode) : 'PROVIDER_ERROR',
        error.message,
      );
  }
}

/**
 * Calls a provider on behalf of a stored credential, for diagnosis and model discovery. The
 * decrypted secret lives only inside withProvider: controllers pass ids, responses carry results,
 * and nothing here writes to the database. A failed test never revokes or flags the credential.
 */
@Injectable()
export class CredentialConnectionService {
  private readonly logger = new Logger(CredentialConnectionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CredentialCryptoService,
    private readonly registry: ProviderRegistry,
  ) {}

  async test(projectId: string, credentialId: string) {
    await this.withProvider(projectId, credentialId, 'test connection', (provider, connection) =>
      provider.testConnection(connection),
    );

    return { ok: true as const };
  }

  /** The provider's current models, flagged when already registered locally. */
  async listRemoteModels(projectId: string, credentialId: string): Promise<RemoteModel[]> {
    const remote = await this.fetchRemoteModels(projectId, credentialId);
    const local = await this.prisma.model.findMany({
      where: { credentialId },
      select: { modelName: true },
    });
    const localNames = new Set(local.map((model) => model.modelName));

    return remote.map((model) => ({ ...model, imported: localNames.has(model.id) }));
  }

  fetchRemoteModels(projectId: string, credentialId: string): Promise<RemoteModelInfo[]> {
    return this.withProvider(projectId, credentialId, 'list models', (provider, connection) =>
      provider.listModels(connection),
    );
  }

  private async withProvider<T>(
    projectId: string,
    credentialId: string,
    action: string,
    call: (provider: LlmProvider, connection: ProviderConnection) => Promise<T>,
  ): Promise<T> {
    const credential = await this.prisma.credential.findFirst({
      where: { id: credentialId, projectId },
      select: {
        provider: true,
        baseUrl: true,
        encryptedSecret: true,
        secretIv: true,
        secretAuthTag: true,
        revokedAt: true,
      },
    });

    if (!credential) {
      throw apiError.notFound('CREDENTIAL_NOT_FOUND', `Credential ${credentialId} not found`);
    }

    if (credential.revokedAt) {
      throw apiError.badRequest('CREDENTIAL_REVOKED', 'Credential has been revoked');
    }

    let apiKey: string;

    try {
      apiKey = this.crypto.decrypt(credential);
    } catch {
      throw apiError.internal(
        'CREDENTIAL_DECRYPTION_ERROR',
        'Stored secret cannot be decrypted; the server master key may have changed',
      );
    }

    try {
      const baseUrl = resolveProviderBaseUrl(credential);
      const provider = this.registry.get(credential.provider);

      // Never log the key, the Authorization header or the ciphertext.
      this.logger.log(
        `${action}: credential ${credentialId} provider=${credential.provider} baseUrl=${baseUrl}`,
      );

      return await call(provider, { baseUrl, apiKey });
    } catch (error) {
      throw toApiError(error);
    }
  }
}
