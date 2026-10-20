import { apiError } from '../common/api-error.js';
import type { CredentialConnectionService } from '../credential/credential-connection.service.js';
import { Prisma } from '../generated/prisma/client.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { AVAILABLE_MODEL, MODEL_CREDENTIAL, MODEL_SUMMARY, ModelService } from './model.service.js';

const SECRET_FIELDS = ['secret', 'encryptedSecret', 'secretIv', 'secretAuthTag'];

const knownError = (code: string) =>
  new Prisma.PrismaClientKnownRequestError('failed', { code, clientVersion: 'test' });

function setup({
  credential = { id: 'cred-1', revokedAt: null } as { id: string; revokedAt: Date | null } | null,
  disableCount = 1,
  remoteIds = ['gpt-5', 'gpt-5-mini'],
} = {}) {
  const prisma = {
    credential: { findFirst: vi.fn(async () => credential) },
    model: {
      create: vi.fn(async (args: { data: { modelName: string } }) => ({ modelName: args.data.modelName })),
      findMany: vi.fn(async () => [] as Array<{ modelName: string }>),
      findFirst: vi.fn(async () => null as unknown),
      update: vi.fn(async () => ({ id: 'model-1' })),
      updateMany: vi.fn(async () => ({ count: disableCount })),
    },
    $transaction: vi.fn(async (operations: Array<Promise<unknown>>) => Promise.all(operations)),
  };
  const connection = {
    fetchRemoteModels: vi.fn(async () => remoteIds.map((id) => ({ id }))),
  };
  const service = new ModelService(
    prisma as unknown as PrismaService,
    connection as unknown as CredentialConnectionService,
  );

  return { service, prisma, connection };
}

type Call = Record<string, unknown> & { data: Record<string, unknown> };
const firstCall = (mock: { mock: { calls: unknown[][] } }) => mock.mock.calls[0][0] as Call;

describe('ModelService.create', () => {
  it('creates a CHAT model under the route credential and returns the summary', async () => {
    const { service, prisma } = setup();

    await service.create('project-1', 'cred-1', { name: 'GPT-4.1 Mini', modelName: 'gpt-4.1-mini', contextWindow: 128000 });

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

  it('creates an embedding model with a fixed vector dimension', async () => {
    const { service, prisma } = setup();

    await service.create('project-1', 'cred-1', {
      name: 'Text Embedding',
      modelName: 'text-embedding-3-small',
      type: 'EMBEDDING',
      embeddingDimensions: 1536,
    });

    expect(firstCall(prisma.model.create).data).toMatchObject({
      type: 'EMBEDDING',
      embeddingDimensions: 1536,
      supportsTemperature: false,
    });
  });

  it('rejects a CHAT model with vector dimensions and an EMBEDDING model without them', async () => {
    const { service, prisma } = setup();

    await expect(service.create('project-1', 'cred-1', {
      name: 'Chat', modelName: 'chat', embeddingDimensions: 1536,
    })).rejects.toMatchObject({ response: { code: 'VALIDATION_FAILED' } });
    await expect(service.create('project-1', 'cred-1', {
      name: 'Embedding', modelName: 'embed', type: 'EMBEDDING',
    })).rejects.toMatchObject({ response: { code: 'VALIDATION_FAILED' } });
    expect(prisma.model.create).not.toHaveBeenCalled();
  });

  it('rejects an unknown credential', async () => {
    const { service, prisma } = setup({ credential: null });

    await expect(service.create('project-1', 'missing', { name: 'M', modelName: 'm' })).rejects.toThrow(
      apiError.notFound('CREDENTIAL_NOT_FOUND', 'Credential missing not found'),
    );
    expect(prisma.model.create).not.toHaveBeenCalled();
  });

  it('rejects a revoked credential', async () => {
    const { service, prisma } = setup({ credential: { id: 'cred-1', revokedAt: new Date() } });

    await expect(service.create('project-1', 'cred-1', { name: 'M', modelName: 'm' })).rejects.toThrow(
      apiError.badRequest('CREDENTIAL_REVOKED', 'Cannot add a model to a revoked credential'),
    );
    expect(prisma.model.create).not.toHaveBeenCalled();
  });

  it('maps the (credentialId, modelName) unique violation to MODEL_NAME_CONFLICT', async () => {
    const { service, prisma } = setup();
    prisma.model.create.mockRejectedValueOnce(knownError('P2002'));

    await expect(service.create('project-1', 'cred-1', { name: 'M', modelName: 'gpt-4.1' })).rejects.toThrow(
      apiError.conflict('MODEL_NAME_CONFLICT', 'Model "gpt-4.1" already exists for this credential'),
    );
  });
});

describe('ModelService.importModels', () => {
  const gpt5 = { modelName: 'gpt-5', name: 'GPT-5', contextWindow: 128000, supportsTemperature: true };
  const mini = { modelName: 'gpt-5-mini', name: 'GPT-5 Mini' };

  it('re-fetches the remote list, then creates every model as CHAT in one transaction', async () => {
    const { service, prisma, connection } = setup();

    const created = await service.importModels('project-1', 'cred-1', { models: [gpt5, mini] });

    expect(connection.fetchRemoteModels).toHaveBeenCalledWith('project-1', 'cred-1');
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.model.create).toHaveBeenCalledWith({
      data: { credentialId: 'cred-1', type: 'CHAT', ...gpt5 },
      select: MODEL_SUMMARY,
    });
    expect(created).toEqual([{ modelName: 'gpt-5' }, { modelName: 'gpt-5-mini' }]);
  });

  it('rejects a modelName the provider does not list, writing nothing', async () => {
    const { service, prisma } = setup();

    await expect(
      service.importModels('project-1', 'cred-1', { models: [gpt5, { modelName: 'totally-fake-model', name: 'Fake' }] }),
    ).rejects.toThrow(
      apiError.badRequest('REMOTE_MODEL_NOT_FOUND', 'The provider does not list "totally-fake-model"'),
    );
    expect(prisma.model.create).not.toHaveBeenCalled();
  });

  it('rejects models that already exist locally before calling the provider', async () => {
    const { service, prisma, connection } = setup();
    prisma.model.findMany.mockResolvedValueOnce([{ modelName: 'gpt-5' }]);

    await expect(service.importModels('project-1', 'cred-1', { models: [gpt5, mini] })).rejects.toThrow(
      apiError.conflict('MODEL_NAME_CONFLICT', 'Model "gpt-5" already exists for this credential'),
    );
    expect(connection.fetchRemoteModels).not.toHaveBeenCalled();
    expect(prisma.model.create).not.toHaveBeenCalled();
  });

  it('rejects the same modelName twice in one request', async () => {
    const { service, connection } = setup();

    await expect(service.importModels('project-1', 'cred-1', { models: [gpt5, gpt5] })).rejects.toMatchObject({
      response: { code: 'VALIDATION_FAILED' },
    });
    expect(connection.fetchRemoteModels).not.toHaveBeenCalled();
  });

  it('maps a concurrent unique violation to MODEL_NAME_CONFLICT, not a Prisma error', async () => {
    const { service, prisma } = setup();
    prisma.$transaction.mockRejectedValueOnce(knownError('P2002'));

    await expect(service.importModels('project-1', 'cred-1', { models: [gpt5] })).rejects.toMatchObject({
      response: { code: 'MODEL_NAME_CONFLICT' },
    });
  });

  it('lets connection errors (revoked credential, provider down) through unchanged', async () => {
    const { service, connection, prisma } = setup();
    const revoked = apiError.badRequest('CREDENTIAL_REVOKED', 'Credential has been revoked');
    connection.fetchRemoteModels.mockRejectedValueOnce(revoked);

    await expect(service.importModels('project-1', 'cred-1', { models: [gpt5] })).rejects.toBe(revoked);
    expect(prisma.model.create).not.toHaveBeenCalled();
  });
});

describe('ModelService.findByCredential', () => {
  it('lists every model of the credential, enabled first then newest', async () => {
    const { service, prisma } = setup();

    await service.findByCredential('project-1', 'cred-1');

    expect(firstCall(prisma.model.findMany)).toEqual({
      where: { credentialId: 'cred-1' },
      orderBy: [{ enabled: 'desc' }, { createdAt: 'desc' }],
      select: MODEL_SUMMARY,
    });
  });

  it('404s for an unknown credential instead of returning an empty list', async () => {
    const { service } = setup({ credential: null });

    await expect(service.findByCredential('project-1', 'missing')).rejects.toThrow(
      apiError.notFound('CREDENTIAL_NOT_FOUND', 'Credential missing not found'),
    );
  });
});

describe('ModelService.findAvailable', () => {
  it('returns enabled models of non-revoked credentials only', async () => {
    const { service, prisma } = setup();

    await service.findAvailable('project-1');

    expect(firstCall(prisma.model.findMany)).toEqual({
      where: { type: 'CHAT', enabled: true, credential: { projectId: 'project-1', revokedAt: null } },
      orderBy: [{ credential: { name: 'asc' } }, { name: 'asc' }],
      select: AVAILABLE_MODEL,
    });
  });

  it('can explicitly list embedding models without mixing them into the chat picker', async () => {
    const { service, prisma } = setup();

    await service.findAvailable('project-1', 'EMBEDDING');

    expect(firstCall(prisma.model.findMany).where).toMatchObject({ type: 'EMBEDDING' });
  });
});

describe('ModelService.findOne', () => {
  it('selects credential metadata through a whitelist, never the secret columns', async () => {
    const { service, prisma } = setup();
    prisma.model.findFirst.mockResolvedValueOnce({ id: 'model-1' });

    await service.findOne('project-1', 'model-1');

    const { select } = firstCall(prisma.model.findFirst);
    expect(select).toEqual({ ...MODEL_SUMMARY, credential: { select: MODEL_CREDENTIAL } });
    for (const field of SECRET_FIELDS) {
      expect(JSON.stringify(select)).not.toContain(field);
    }
    expect(JSON.stringify(AVAILABLE_MODEL)).not.toMatch(/secret/i);
  });

  it('404s for an unknown model', async () => {
    const { service } = setup();

    await expect(service.findOne('project-1', 'missing')).rejects.toThrow(
      apiError.notFound('MODEL_NOT_FOUND', 'Model missing not found'),
    );
  });
});

describe('ModelService.update', () => {
  it('only writes metadata fields', async () => {
    const { service, prisma } = setup();
    prisma.model.findFirst.mockResolvedValueOnce({ id: 'model-1' });

    await service.update('project-1', 'model-1', { name: 'Renamed', contextWindow: null, enabled: true });

    expect(firstCall(prisma.model.update)).toEqual({
      where: { id: 'model-1' },
      data: { name: 'Renamed', contextWindow: null, supportsTemperature: undefined, enabled: true },
      select: MODEL_SUMMARY,
    });
  });

  it('maps a missing row to MODEL_NOT_FOUND', async () => {
    const { service, prisma } = setup();
    prisma.model.findFirst.mockResolvedValueOnce({ id: 'missing' });
    prisma.model.update.mockRejectedValueOnce(knownError('P2025'));

    await expect(service.update('project-1', 'missing', { name: 'X' })).rejects.toThrow(
      apiError.notFound('MODEL_NOT_FOUND', 'Model missing not found'),
    );
  });
});

describe('ModelService.disable', () => {
  it('flips enabled and keeps the row', async () => {
    const { service, prisma } = setup();
    prisma.model.findFirst.mockResolvedValueOnce({ id: 'model-1' });

    await service.disable('project-1', 'model-1');

    expect(firstCall(prisma.model.updateMany)).toEqual({
      where: { id: 'model-1', enabled: true },
      data: { enabled: false },
    });
  });

  it('404s for a missing or already disabled model', async () => {
    const { service, prisma } = setup({ disableCount: 0 });
    prisma.model.findFirst.mockResolvedValueOnce({ id: 'model-1' });

    await expect(service.disable('project-1', 'model-1')).rejects.toThrow(
      apiError.notFound('MODEL_NOT_FOUND', 'Model model-1 not found or already disabled'),
    );
  });
});
