import { randomBytes } from 'node:crypto';
import type { ConfigService } from '@nestjs/config';
import { LlmProviderError, ProviderRegistry, type LlmProvider } from '@flowmind/shared';
import type { PrismaService } from '../prisma/prisma.service.js';
import { CredentialConnectionService } from './credential-connection.service.js';
import { CredentialCryptoService } from './credential-crypto.service.js';

const SECRET = 'sk-connection-secret';
const crypto = new CredentialCryptoService({
  get: () => randomBytes(32).toString('base64'),
} as unknown as ConfigService);

function credentialRow(overrides: Record<string, unknown> = {}) {
  return { provider: 'DEEPSEEK', baseUrl: null, revokedAt: null, ...crypto.encrypt(SECRET), ...overrides };
}

function setup(row: unknown = credentialRow(), localModels: string[] = []) {
  const prisma = {
    credential: { findFirst: vi.fn(async () => row) },
    model: { findMany: vi.fn(async () => localModels.map((modelName) => ({ modelName }))) },
  };
  const provider = {
    generate: vi.fn(),
    listModels: vi.fn(async () => [{ id: 'deepseek-chat' }, { id: 'deepseek-reasoner' }]),
    testConnection: vi.fn(async () => undefined),
  };
  const service = new CredentialConnectionService(
    prisma as unknown as PrismaService,
    crypto,
    new ProviderRegistry(provider as unknown as LlmProvider),
  );

  return { service, prisma, provider };
}

const responseOf = (error: unknown) => ({
  status: (error as { getStatus: () => number }).getStatus(),
  body: (error as { getResponse: () => { code: string; message: string } }).getResponse(),
});

describe('CredentialConnectionService.test', () => {
  it('decrypts the stored secret and tests the default base URL, returning only ok', async () => {
    const { service, provider } = setup();

    const result = await service.test('project-1', 'cred-1');

    expect(result).toEqual({ ok: true });
    expect(provider.testConnection).toHaveBeenCalledWith({
      baseUrl: 'https://api.deepseek.com',
      apiKey: SECRET,
    });
    expect(JSON.stringify(result)).not.toContain(SECRET);
  });

  it('uses the credential base URL when set', async () => {
    const { service, provider } = setup(
      credentialRow({ provider: 'OPENAI_COMPATIBLE', baseUrl: 'http://localhost:8000/v1/' }),
    );

    await service.test('project-1', 'cred-1');

    expect(provider.testConnection).toHaveBeenCalledWith(
      expect.objectContaining({ baseUrl: 'http://localhost:8000/v1' }),
    );
  });

  it('404s for an unknown credential', async () => {
    const { service } = setup(null);

    const error = await service.test('project-1', 'missing').catch((e: unknown) => e);

    expect(responseOf(error)).toMatchObject({ status: 404, body: { code: 'CREDENTIAL_NOT_FOUND' } });
  });

  it('rejects a revoked credential without decrypting it or calling the provider', async () => {
    const decrypt = vi.spyOn(crypto, 'decrypt');
    const { service, provider } = setup(credentialRow({ revokedAt: new Date() }));

    const error = await service.test('project-1', 'cred-1').catch((e: unknown) => e);

    expect(responseOf(error)).toMatchObject({ status: 400, body: { code: 'CREDENTIAL_REVOKED' } });
    expect(decrypt).not.toHaveBeenCalled();
    expect(provider.testConnection).not.toHaveBeenCalled();
    decrypt.mockRestore();
  });

  it('reports an undecryptable secret as CREDENTIAL_DECRYPTION_ERROR', async () => {
    const { service, provider } = setup(credentialRow({ encryptedSecret: 'AAAA' }));

    const error = await service.test('project-1', 'cred-1').catch((e: unknown) => e);

    expect(responseOf(error)).toMatchObject({ status: 500, body: { code: 'CREDENTIAL_DECRYPTION_ERROR' } });
    expect(provider.testConnection).not.toHaveBeenCalled();
  });

  it.each([
    ['AUTH_ERROR', 502, 'AUTH_ERROR'],
    ['NETWORK_ERROR', 502, 'NETWORK_ERROR'],
    ['ENDPOINT_NOT_FOUND', 502, 'ENDPOINT_NOT_FOUND'],
    ['INVALID_PROVIDER_RESPONSE', 502, 'INVALID_PROVIDER_RESPONSE'],
    ['UNKNOWN', 502, 'PROVIDER_ERROR'],
    ['TIMEOUT', 504, 'TIMEOUT'],
  ] as const)('maps provider %s to HTTP %i with code %s', async (providerCode, status, code) => {
    const { service, provider } = setup();
    provider.testConnection.mockRejectedValueOnce(
      new LlmProviderError({ code: providerCode, message: 'provider said no' }),
    );

    const error = await service.test('project-1', 'cred-1').catch((e: unknown) => e);

    expect(responseOf(error)).toEqual({
      status,
      body: { statusCode: status, error: expect.any(String), code, message: 'provider said no' },
    });
  });

  it('requires a base URL for an OpenAI-compatible credential', async () => {
    const { service, provider } = setup(credentialRow({ provider: 'OPENAI_COMPATIBLE', baseUrl: null }));

    const error = await service.test('project-1', 'cred-1').catch((e: unknown) => e);

    expect(responseOf(error)).toMatchObject({ status: 400, body: { code: 'CREDENTIAL_BASE_URL_REQUIRED' } });
    expect(provider.testConnection).not.toHaveBeenCalled();
  });
});

describe('CredentialConnectionService.listRemoteModels', () => {
  it('returns the provider models flagged imported when a local model has that modelName', async () => {
    const { service, prisma } = setup(credentialRow(), ['deepseek-chat']);

    await expect(service.listRemoteModels('project-1', 'cred-1')).resolves.toEqual([
      { id: 'deepseek-chat', imported: true },
      { id: 'deepseek-reasoner', imported: false },
    ]);
    expect(prisma.model.findMany).toHaveBeenCalledWith({
      where: { credentialId: 'cred-1' },
      select: { modelName: true },
    });
  });

  it('never writes to the database', async () => {
    const { service, prisma } = setup();

    await service.listRemoteModels('project-1', 'cred-1');

    expect(Object.keys(prisma.model)).toEqual(['findMany']);
  });
});
