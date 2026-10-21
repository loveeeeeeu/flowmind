import { randomBytes } from 'node:crypto';
import { CredentialCrypto } from '@flowmind/shared';
import type { PrismaService } from '../prisma/prisma.service.js';
import { RuntimeModelResolver } from './runtime-model-resolver.js';

const SECRET = 'sk-runtime-secret';
const crypto = new CredentialCrypto(randomBytes(32));

function modelRow(overrides: { revokedAt?: Date | null; enabled?: boolean; type?: 'CHAT' | 'EMBEDDING'; embeddingDimensions?: number | null } = {}) {
  return {
    id: 'model-1',
    modelName: 'deepseek-chat',
    supportsTemperature: true,
    type: overrides.type ?? 'CHAT',
    embeddingDimensions: overrides.embeddingDimensions ?? null,
    enabled: overrides.enabled ?? true,
    credential: {
      provider: 'DEEPSEEK',
      baseUrl: null,
      revokedAt: overrides.revokedAt ?? null,
      ...crypto.encrypt(SECRET),
    },
  };
}

function setup(row: unknown, resolverCrypto = crypto) {
  const findUnique = vi.fn(async () => row);
  const resolver = new RuntimeModelResolver(
    { model: { findUnique } } as unknown as PrismaService,
    resolverCrypto,
  );

  return { resolver, findUnique };
}

describe('RuntimeModelResolver', () => {
  it('resolves a model to its provider call config with the decrypted secret', async () => {
    const { resolver, findUnique } = setup(modelRow());

    await expect(resolver.resolve('model-1')).resolves.toEqual({
      modelId: 'model-1',
      modelName: 'deepseek-chat',
      provider: 'DEEPSEEK',
      baseUrl: null,
      apiKey: SECRET,
      type: 'CHAT',
      embeddingDimensions: null,
      enabled: true,
      supportsTemperature: true,
    });
    expect(findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'model-1' } }));
  });

  it('only resolves embedding models with configured dimensions for embedding calls', async () => {
    const { resolver } = setup(modelRow({ type: 'EMBEDDING', embeddingDimensions: 1536 }));
    await expect(resolver.resolveEmbeddingModel('model-1')).resolves.toMatchObject({
      type: 'EMBEDDING', embeddingDimensions: 1536,
    });

    await expect(setup(modelRow()).resolver.resolveEmbeddingModel('model-1')).rejects.toMatchObject({
      code: 'MODEL_TYPE_MISMATCH', retryable: false,
    });
    await expect(setup(modelRow({ type: 'EMBEDDING' })).resolver.resolveEmbeddingModel('model-1')).rejects.toMatchObject({
      code: 'EMBEDDING_DIMENSIONS_MISSING', retryable: false,
    });
    await expect(setup(modelRow({ type: 'EMBEDDING', embeddingDimensions: 1536, enabled: false })).resolver.resolveEmbeddingModel('model-1')).rejects.toMatchObject({
      code: 'MODEL_DISABLED', retryable: false,
    });
  });

  it('does not check Model.enabled: a disabled model still runs for published versions', async () => {
    const { resolver, findUnique } = setup(modelRow({ enabled: false }));

    await expect(resolver.resolve('model-1')).resolves.toMatchObject({ apiKey: SECRET });
    // Exactly { id }: no enabled filter.
    expect(findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'model-1' } }));
  });

  it('fails with MODEL_NOT_FOUND, not retryable, for an unknown model', async () => {
    const { resolver } = setup(null);

    await expect(resolver.resolve('missing')).rejects.toMatchObject({
      code: 'MODEL_NOT_FOUND',
      retryable: false,
    });
  });

  it('fails with CREDENTIAL_REVOKED and never decrypts a revoked credential', async () => {
    const decrypt = vi.spyOn(crypto, 'decrypt');
    const { resolver } = setup(modelRow({ revokedAt: new Date() }));

    await expect(resolver.resolve('model-1')).rejects.toMatchObject({
      code: 'CREDENTIAL_REVOKED',
      retryable: false,
    });
    expect(decrypt).not.toHaveBeenCalled();
    decrypt.mockRestore();
  });

  it('fails with CREDENTIAL_DECRYPTION_ERROR, not retryable, for a tampered ciphertext', async () => {
    const row = modelRow();
    row.credential.encryptedSecret = Buffer.from('junk').toString('base64');
    const { resolver } = setup(row);

    await expect(resolver.resolve('model-1')).rejects.toMatchObject({
      code: 'CREDENTIAL_DECRYPTION_ERROR',
      retryable: false,
    });
  });

  it('fails with CREDENTIAL_DECRYPTION_ERROR when the worker has another master key', async () => {
    const { resolver } = setup(modelRow(), new CredentialCrypto(randomBytes(32)));

    const error = await resolver.resolve('model-1').catch((e: unknown) => e);

    expect(error).toMatchObject({ code: 'CREDENTIAL_DECRYPTION_ERROR', retryable: false });
    expect((error as Error).message).not.toContain(SECRET);
  });
});
