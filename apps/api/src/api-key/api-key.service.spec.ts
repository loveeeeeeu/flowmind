import { NotFoundException } from '@nestjs/common';
import type { PrismaService } from '../prisma/prisma.service.js';
import { generateApiKey, hashApiKey } from './api-key.secret.js';
import { ApiKeyService } from './api-key.service.js';

interface KeyRow {
  id: string;
  workflowId: string;
  keyHash: string;
  revokedAt: Date | null;
}

function setup({
  workflowExists = true,
  keyRow = null as KeyRow | null,
  revokeCount = 1,
  touchFails = false,
} = {}) {
  const prisma = {
    workflow: {
      findUnique: vi.fn(async () => (workflowExists ? { id: 'workflow-1' } : null)),
    },
    workflowApiKey: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
        id: 'key-1',
        workflowId: data.workflowId,
        name: data.name,
        prefix: data.prefix,
        lastUsedAt: null,
        revokedAt: null,
        createdAt: new Date(),
      })),
      findMany: vi.fn(async () => []),
      findUnique: vi.fn(async () => keyRow),
      updateMany: vi.fn(async () => ({ count: revokeCount })),
      update: vi.fn(async () => {
        if (touchFails) {
          throw new Error('database is read-only');
        }
        return {};
      }),
    },
  };
  const service = new ApiKeyService(prisma as unknown as PrismaService);

  return { service, prisma };
}

describe('ApiKeyService', () => {
  it('returns the raw key once and stores only its hash', async () => {
    const { service, prisma } = setup();

    const created = await service.create('workflow-1', 'Backend Production');

    const [[{ data, select }]] = prisma.workflowApiKey.create.mock.calls as unknown as [
      [{ data: Record<string, string>; select: Record<string, boolean> }],
    ];
    expect(created.key).toMatch(/^fm_[0-9a-f]{16}_/);
    expect(data).toEqual({
      workflowId: 'workflow-1',
      name: 'Backend Production',
      prefix: created.prefix,
      keyHash: hashApiKey(created.key),
    });
    expect(Object.values(data)).not.toContain(created.key);
    expect(select).not.toHaveProperty('keyHash');
  });

  it('cannot create or list keys of a missing workflow', async () => {
    const { service, prisma } = setup({ workflowExists: false });

    await expect(service.create('missing', 'x')).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.list('missing')).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.workflowApiKey.create).not.toHaveBeenCalled();
  });

  it('lists keys without their hash', async () => {
    const { service, prisma } = setup();

    await service.list('workflow-1');

    const [[args]] = prisma.workflowApiKey.findMany.mock.calls as unknown as [
      [{ where: unknown; select: Record<string, boolean> }],
    ];
    expect(args.where).toEqual({ workflowId: 'workflow-1' });
    expect(args.select).not.toHaveProperty('keyHash');
  });

  it('revokes only a live key of the given workflow', async () => {
    const { service, prisma } = setup();

    await service.revoke('workflow-1', 'key-1');

    expect(prisma.workflowApiKey.updateMany).toHaveBeenCalledWith({
      where: { id: 'key-1', workflowId: 'workflow-1', revokedAt: null },
      data: { revokedAt: expect.any(Date) as Date },
    });
  });

  it('returns 404 when there is no live key to revoke', async () => {
    const { service } = setup({ revokeCount: 0 });

    await expect(service.revoke('workflow-1', 'key-1')).rejects.toBeInstanceOf(NotFoundException);
  });

  describe('verify', () => {
    const { prefix, key, keyHash } = generateApiKey();
    const liveRow = { id: 'key-1', workflowId: 'workflow-1', keyHash, revokedAt: null };

    it('accepts a live key, looks it up by prefix and touches lastUsedAt', async () => {
      const { service, prisma } = setup({ keyRow: liveRow });

      await expect(service.verify(key)).resolves.toEqual({
        id: 'key-1',
        workflowId: 'workflow-1',
      });
      expect(prisma.workflowApiKey.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { prefix } }),
      );
      expect(prisma.workflowApiKey.update).toHaveBeenCalledWith({
        where: { id: 'key-1' },
        data: { lastUsedAt: expect.any(Date) as Date },
      });
    });

    it('does not query the database for a malformed key', async () => {
      const { service, prisma } = setup({ keyRow: liveRow });

      await expect(service.verify('fm_fake_fake')).resolves.toBeNull();
      expect(prisma.workflowApiKey.findUnique).not.toHaveBeenCalled();
    });

    it('rejects an unknown prefix', async () => {
      const { service } = setup({ keyRow: null });

      await expect(service.verify(key)).resolves.toBeNull();
    });

    it('rejects a revoked key', async () => {
      const { service, prisma } = setup({ keyRow: { ...liveRow, revokedAt: new Date() } });

      await expect(service.verify(key)).resolves.toBeNull();
      expect(prisma.workflowApiKey.update).not.toHaveBeenCalled();
    });

    it('rejects a key with the right prefix but a wrong secret', async () => {
      const { service } = setup({ keyRow: liveRow });
      const forged = `fm_${prefix}_${'x'.repeat(43)}`;

      await expect(service.verify(forged)).resolves.toBeNull();
    });

    it('still authenticates when updating lastUsedAt fails', async () => {
      const { service } = setup({ keyRow: liveRow, touchFails: true });

      await expect(service.verify(key)).resolves.toEqual({
        id: 'key-1',
        workflowId: 'workflow-1',
      });
    });
  });
});
