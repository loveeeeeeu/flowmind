import { randomBytes } from 'node:crypto';
import type { ConfigService } from '@nestjs/config';
import { apiError } from '../common/api-error.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { CredentialCryptoService } from './credential-crypto.service.js';
import { CredentialService } from './credential.service.js';

const SECRET = 'super-secret-openai-key';
const SECRET_FIELDS = ['secret', 'encryptedSecret', 'secretIv', 'secretAuthTag'];
const summarySelect = {
  id: true,
  name: true,
  provider: true,
  baseUrl: true,
  revokedAt: true,
  createdAt: true,
  updatedAt: true,
};

interface Row {
  provider: string;
  baseUrl: string | null;
  revokedAt: Date | null;
}

function setup({ row = { provider: 'OPENAI', baseUrl: null, revokedAt: null } as Row | null, revokeCount = 1 } = {}) {
  const prisma = {
    credential: {
      create: vi.fn(async () => ({ id: 'cred-1' })),
      findMany: vi.fn(async () => []),
      findUnique: vi.fn(async () => row),
      update: vi.fn(async () => ({ id: 'cred-1' })),
      updateMany: vi.fn(async () => ({ count: revokeCount })),
    },
  };
  const config = { get: vi.fn(() => randomBytes(32).toString('base64')) };
  const crypto = new CredentialCryptoService(config as unknown as ConfigService);
  const service = new CredentialService(prisma as unknown as PrismaService, crypto);

  return { service, prisma, crypto };
}

type Call = { data: Record<string, unknown>; select: Record<string, boolean> };
const firstCall = (mock: { mock: { calls: unknown[][] } }) => mock.mock.calls[0][0] as Call;

describe('CredentialService.create', () => {
  it('stores only the encrypted secret and returns a whitelist of fields', async () => {
    const { service, prisma, crypto } = setup();

    await service.create({ name: 'My DeepSeek', provider: 'DEEPSEEK', baseUrl: 'https://api.deepseek.com', secret: SECRET });

    const { data, select } = firstCall(prisma.credential.create);
    expect(data).toMatchObject({ name: 'My DeepSeek', provider: 'DEEPSEEK', baseUrl: 'https://api.deepseek.com' });
    expect(data).not.toHaveProperty('secret');
    expect(JSON.stringify(data)).not.toContain(SECRET);
    expect(crypto.decrypt(data as never)).toBe(SECRET);
    expect(select).toEqual(summarySelect);
  });

  it('uses the official endpoint (null) when OpenAI / DeepSeek have no baseUrl', async () => {
    const { service, prisma } = setup();

    await service.create({ name: 'OpenAI', provider: 'OPENAI', secret: SECRET });

    expect(firstCall(prisma.credential.create).data.baseUrl).toBeNull();
  });

  it('requires a baseUrl for OpenAI-compatible credentials', async () => {
    const { service, prisma } = setup();

    await expect(
      service.create({ name: 'Local vLLM', provider: 'OPENAI_COMPATIBLE', secret: SECRET }),
    ).rejects.toThrow(
      apiError.badRequest('CREDENTIAL_BASE_URL_REQUIRED', 'Base URL is required for OpenAI-compatible credentials'),
    );
    expect(prisma.credential.create).not.toHaveBeenCalled();
  });
});

describe('CredentialService queries', () => {
  it('lists newest first without secret fields', async () => {
    const { service, prisma } = setup();

    await service.findAll();

    expect(prisma.credential.findMany).toHaveBeenCalledWith({
      orderBy: { createdAt: 'desc' },
      select: summarySelect,
    });
  });

  it('reads one credential without secret fields', async () => {
    const { service, prisma } = setup();

    await service.findOne('cred-1');

    expect(prisma.credential.findUnique).toHaveBeenCalledWith({ where: { id: 'cred-1' }, select: summarySelect });
  });

  it('returns CREDENTIAL_NOT_FOUND for an unknown id', async () => {
    const { service } = setup({ row: null });

    await expect(service.findOne('missing')).rejects.toThrow(
      apiError.notFound('CREDENTIAL_NOT_FOUND', 'Credential missing not found'),
    );
  });
});

describe('CredentialService.update', () => {
  it('keeps the old secret when none is sent, without ever reading it', async () => {
    const { service, prisma } = setup();

    await service.update('cred-1', { name: 'Renamed' });

    const lookup = firstCall(prisma.credential.findUnique);
    expect(Object.keys(lookup.select).filter((field) => SECRET_FIELDS.includes(field))).toEqual([]);
    const { data, select } = firstCall(prisma.credential.update);
    expect(data).toEqual({ name: 'Renamed', baseUrl: undefined });
    expect(select).toEqual(summarySelect);
  });

  it('re-encrypts a new secret and overwrites the ciphertext', async () => {
    const { service, prisma, crypto } = setup();

    await service.update('cred-1', { secret: 'sk-new' });

    const { data } = firstCall(prisma.credential.update);
    expect(data).not.toHaveProperty('secret');
    expect(crypto.decrypt(data as never)).toBe('sk-new');
  });

  it('can reset OpenAI / DeepSeek to the official endpoint', async () => {
    const { service, prisma } = setup({ row: { provider: 'OPENAI', baseUrl: 'https://proxy.example.com', revokedAt: null } });

    await service.update('cred-1', { baseUrl: null });

    expect(firstCall(prisma.credential.update).data.baseUrl).toBeNull();
  });

  it('refuses to clear the baseUrl of an OpenAI-compatible credential', async () => {
    const { service, prisma } = setup({
      row: { provider: 'OPENAI_COMPATIBLE', baseUrl: 'http://localhost:8000/v1', revokedAt: null },
    });

    await expect(service.update('cred-1', { baseUrl: null })).rejects.toThrow(
      apiError.badRequest('CREDENTIAL_BASE_URL_REQUIRED', 'Base URL is required for OpenAI-compatible credentials'),
    );
    await expect(service.update('cred-1', { name: 'Still has its URL' })).resolves.toBeDefined();
    expect(prisma.credential.update).toHaveBeenCalledTimes(1);
  });

  it('refuses to update a revoked credential', async () => {
    const { service, prisma } = setup({ row: { provider: 'OPENAI', baseUrl: null, revokedAt: new Date() } });

    await expect(service.update('cred-1', { secret: 'sk-new' })).rejects.toThrow(
      apiError.badRequest('CREDENTIAL_REVOKED', 'Revoked credential cannot be updated'),
    );
    expect(prisma.credential.update).not.toHaveBeenCalled();
  });
});

describe('CredentialService.revoke', () => {
  it('soft-deletes only a live credential', async () => {
    const { service, prisma } = setup();

    await service.revoke('cred-1');

    expect(prisma.credential.updateMany).toHaveBeenCalledWith({
      where: { id: 'cred-1', revokedAt: null },
      data: { revokedAt: expect.any(Date) as Date },
    });
  });

  it('returns CREDENTIAL_NOT_FOUND when there is nothing left to revoke', async () => {
    const { service } = setup({ revokeCount: 0 });

    await expect(service.revoke('cred-1')).rejects.toThrow(
      apiError.notFound('CREDENTIAL_NOT_FOUND', 'Credential cred-1 not found'),
    );
  });
});
