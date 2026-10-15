import { apiError } from '../common/api-error.js';
import { Prisma } from '../generated/prisma/client.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { AVAILABLE_MODEL, MODEL_CREDENTIAL, MODEL_SUMMARY, ModelService } from './model.service.js';

const SECRET_FIELDS = ['secret', 'encryptedSecret', 'secretIv', 'secretAuthTag'];

const knownError = (code: string) =>
  new Prisma.PrismaClientKnownRequestError('failed', { code, clientVersion: 'test' });

function setup({
  credential = { id: 'cred-1', revokedAt: null } as { id: string; revokedAt: Date | null } | null,
  disableCount = 1,
} = {}) {
  const prisma = {
    credential: { findUnique: vi.fn(async () => credential) },
    model: {
      create: vi.fn(async () => ({ id: 'model-1' })),
      findMany: vi.fn(async () => []),
      findUnique: vi.fn(async () => null as unknown),
      update: vi.fn(async () => ({ id: 'model-1' })),
      updateMany: vi.fn(async () => ({ count: disableCount })),
    },
  };
  const service = new ModelService(prisma as unknown as PrismaService);

  return { service, prisma };
}

type Call = Record<string, unknown> & { data: Record<string, unknown> };
const firstCall = (mock: { mock: { calls: unknown[][] } }) => mock.mock.calls[0][0] as Call;

describe('ModelService.create', () => {
  it('creates a CHAT model under the route credential and returns the summary', async () => {
    const { service, prisma } = setup();

    await service.create('cred-1', { name: 'GPT-4.1 Mini', modelName: 'gpt-4.1-mini', contextWindow: 128000 });

    expect(firstCall(prisma.model.create)).toEqual({
      data: {
        credentialId: 'cred-1',
        name: 'GPT-4.1 Mini',
        modelName: 'gpt-4.1-mini',
        type: 'CHAT',
        contextWindow: 128000,
        supportsTemperature: undefined,
      },
      select: MODEL_SUMMARY,
    });
  });

  it('rejects an unknown credential', async () => {
    const { service, prisma } = setup({ credential: null });

    await expect(service.create('missing', { name: 'M', modelName: 'm' })).rejects.toThrow(
      apiError.notFound('CREDENTIAL_NOT_FOUND', 'Credential missing not found'),
    );
    expect(prisma.model.create).not.toHaveBeenCalled();
  });

  it('rejects a revoked credential', async () => {
    const { service, prisma } = setup({ credential: { id: 'cred-1', revokedAt: new Date() } });

    await expect(service.create('cred-1', { name: 'M', modelName: 'm' })).rejects.toThrow(
      apiError.badRequest('CREDENTIAL_REVOKED', 'Cannot add a model to a revoked credential'),
    );
    expect(prisma.model.create).not.toHaveBeenCalled();
  });

  it('maps the (credentialId, modelName) unique violation to MODEL_NAME_CONFLICT', async () => {
    const { service, prisma } = setup();
    prisma.model.create.mockRejectedValueOnce(knownError('P2002'));

    await expect(service.create('cred-1', { name: 'M', modelName: 'gpt-4.1' })).rejects.toThrow(
      apiError.conflict('MODEL_NAME_CONFLICT', 'Model "gpt-4.1" already exists for this credential'),
    );
  });
});

describe('ModelService.findByCredential', () => {
  it('lists every model of the credential, enabled first then newest', async () => {
    const { service, prisma } = setup();

    await service.findByCredential('cred-1');

    expect(firstCall(prisma.model.findMany)).toEqual({
      where: { credentialId: 'cred-1' },
      orderBy: [{ enabled: 'desc' }, { createdAt: 'desc' }],
      select: MODEL_SUMMARY,
    });
  });

  it('404s for an unknown credential instead of returning an empty list', async () => {
    const { service } = setup({ credential: null });

    await expect(service.findByCredential('missing')).rejects.toThrow(
      apiError.notFound('CREDENTIAL_NOT_FOUND', 'Credential missing not found'),
    );
  });
});

describe('ModelService.findAvailable', () => {
  it('returns enabled models of non-revoked credentials only', async () => {
    const { service, prisma } = setup();

    await service.findAvailable();

    expect(firstCall(prisma.model.findMany)).toEqual({
      where: { enabled: true, credential: { revokedAt: null } },
      orderBy: [{ credential: { name: 'asc' } }, { name: 'asc' }],
      select: AVAILABLE_MODEL,
    });
  });
});

describe('ModelService.findOne', () => {
  it('selects credential metadata through a whitelist, never the secret columns', async () => {
    const { service, prisma } = setup();
    prisma.model.findUnique.mockResolvedValueOnce({ id: 'model-1' });

    await service.findOne('model-1');

    const { select } = firstCall(prisma.model.findUnique);
    expect(select).toEqual({ ...MODEL_SUMMARY, credential: { select: MODEL_CREDENTIAL } });
    for (const field of SECRET_FIELDS) {
      expect(JSON.stringify(select)).not.toContain(field);
    }
    expect(JSON.stringify(AVAILABLE_MODEL)).not.toMatch(/secret/i);
  });

  it('404s for an unknown model', async () => {
    const { service } = setup();

    await expect(service.findOne('missing')).rejects.toThrow(
      apiError.notFound('MODEL_NOT_FOUND', 'Model missing not found'),
    );
  });
});

describe('ModelService.update', () => {
  it('only writes metadata fields', async () => {
    const { service, prisma } = setup();

    await service.update('model-1', { name: 'Renamed', contextWindow: null, enabled: true });

    expect(firstCall(prisma.model.update)).toEqual({
      where: { id: 'model-1' },
      data: { name: 'Renamed', contextWindow: null, supportsTemperature: undefined, enabled: true },
      select: MODEL_SUMMARY,
    });
  });

  it('maps a missing row to MODEL_NOT_FOUND', async () => {
    const { service, prisma } = setup();
    prisma.model.update.mockRejectedValueOnce(knownError('P2025'));

    await expect(service.update('missing', { name: 'X' })).rejects.toThrow(
      apiError.notFound('MODEL_NOT_FOUND', 'Model missing not found'),
    );
  });
});

describe('ModelService.disable', () => {
  it('flips enabled and keeps the row', async () => {
    const { service, prisma } = setup();

    await service.disable('model-1');

    expect(firstCall(prisma.model.updateMany)).toEqual({
      where: { id: 'model-1', enabled: true },
      data: { enabled: false },
    });
  });

  it('404s for a missing or already disabled model', async () => {
    const { service } = setup({ disableCount: 0 });

    await expect(service.disable('model-1')).rejects.toThrow(
      apiError.notFound('MODEL_NOT_FOUND', 'Model model-1 not found or already disabled'),
    );
  });
});
