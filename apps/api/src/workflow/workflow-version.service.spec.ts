import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { WorkflowVersionService } from './workflow-version.service.js';

interface StoredVersion {
  id: string;
  workflowId: string;
  version: number;
  draftRevision: number;
  canvas: unknown;
  createdAt: Date;
}

/** In-memory stand-in for the rows the publish transaction reads and writes. */
function createService() {
  const versions: StoredVersion[] = [];
  const workflow = { id: 'workflow-1', status: 'DRAFT', draftRevision: 0 };

  const tx = {
    workflow: {
      findUnique: vi.fn(async () => ({ draftRevision: workflow.draftRevision })),
      update: vi.fn(async ({ data }: { data: { status: string } }) => {
        workflow.status = data.status;
        return workflow;
      }),
    },
    workflowVersion: {
      findFirst: vi.fn(async () => [...versions].sort((a, b) => b.version - a.version)[0] ?? null),
      create: vi.fn(async ({ data }: { data: Omit<StoredVersion, 'id' | 'createdAt'> }) => {
        const stored = { ...data, id: `version-${versions.length + 1}`, createdAt: new Date() };
        versions.push(stored);

        return {
          id: stored.id,
          workflowId: stored.workflowId,
          version: stored.version,
          draftRevision: stored.draftRevision,
          createdAt: stored.createdAt,
        };
      }),
    },
  };

  const prisma = {
    $transaction: vi.fn(async (fn: (client: typeof tx) => Promise<unknown>) => fn(tx)),
    workflowVersion: {
      findMany: vi.fn(async () => []),
      findFirst: vi.fn(async () => null),
    },
  };

  /** What a draft save does to the revision. */
  const saveDraft = () => {
    workflow.draftRevision += 1;
  };

  return {
    prisma,
    tx,
    versions,
    workflow,
    saveDraft,
    service: new WorkflowVersionService(prisma as unknown as PrismaService),
  };
}

const canvasA = {
  nodes: [
    { id: 'start', type: 'start', data: {} },
    { id: 'end', type: 'end', data: { outputVariable: 'text' } },
  ],
  edges: [{ source: 'start', target: 'end' }],
};
const canvasB = {
  ...canvasA,
  nodes: [...canvasA.nodes, { id: 'tpl', type: 'template', data: {} }],
};

describe('WorkflowVersionService.publish', () => {
  it('first publish creates v1 with the published draft revision and marks PUBLISHED', async () => {
    const { service, versions, workflow, saveDraft } = createService();
    saveDraft();
    saveDraft();

    const result = await service.publish({
      workflowId: 'workflow-1',
      canvas: canvasA,
      expectedDraftRevision: 2,
    });

    expect(result).toMatchObject({ version: 1, draftRevision: 2 });
    expect(result).not.toHaveProperty('canvas');
    expect(versions).toHaveLength(1);
    expect(workflow.status).toBe('PUBLISHED');
  });

  it('second publish after a new save creates v2 and leaves the v1 snapshot untouched', async () => {
    const { service, versions, saveDraft } = createService();
    saveDraft();
    await service.publish({ workflowId: 'workflow-1', canvas: canvasA, expectedDraftRevision: 1 });
    saveDraft();
    await service.publish({ workflowId: 'workflow-1', canvas: canvasB, expectedDraftRevision: 2 });

    expect(versions.map((v) => [v.version, v.draftRevision])).toEqual([
      [1, 1],
      [2, 2],
    ]);
    expect(versions[0].canvas).toEqual(canvasA);
  });

  it('rejects publishing the same revision twice (no unpublished changes)', async () => {
    const { service, versions, saveDraft } = createService();
    saveDraft();
    await service.publish({ workflowId: 'workflow-1', canvas: canvasA, expectedDraftRevision: 1 });

    await expect(
      service.publish({ workflowId: 'workflow-1', canvas: canvasA, expectedDraftRevision: 1 }),
    ).rejects.toThrow(new BadRequestException('Workflow has no unpublished changes'));
    expect(versions).toHaveLength(1);
  });

  it('rejects when the draft was saved after validation (optimistic revision check)', async () => {
    const { service, versions, saveDraft } = createService();
    saveDraft(); // validated at revision 1 ...
    saveDraft(); // ... but a save lands before the transaction: revision 2

    await expect(
      service.publish({ workflowId: 'workflow-1', canvas: canvasA, expectedDraftRevision: 1 }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(versions).toHaveLength(0);
  });

  it('turns a concurrent publish (unique version clash) into 409', async () => {
    const { service, tx, saveDraft } = createService();
    saveDraft();
    tx.workflowVersion.create.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: 'test',
      }),
    );

    await expect(
      service.publish({ workflowId: 'workflow-1', canvas: canvasA, expectedDraftRevision: 1 }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});

describe('WorkflowVersionService queries', () => {
  const summary = { id: true, workflowId: true, version: true, draftRevision: true, createdAt: true };

  it('lists version metadata of one workflow, newest first, without canvas snapshots', async () => {
    const { prisma, service } = createService();

    await service.findByWorkflow('workflow-1');

    expect(prisma.workflowVersion.findMany).toHaveBeenCalledWith({
      where: { workflowId: 'workflow-1' },
      orderBy: { version: 'desc' },
      take: 50,
      select: summary,
    });
  });

  it('loads one version with its canvas, scoped to the workflow', async () => {
    const { prisma, service } = createService();
    prisma.workflowVersion.findFirst.mockResolvedValueOnce({ id: 'version-1' } as never);

    await service.findOne('workflow-1', 'version-1');

    expect(prisma.workflowVersion.findFirst).toHaveBeenCalledWith({
      where: { id: 'version-1', workflowId: 'workflow-1' },
      select: { ...summary, canvas: true },
    });
  });

  it('returns 404 for a version of another workflow', async () => {
    const { service } = createService();

    await expect(service.findOne('workflow-1', 'version-of-other')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('exposes no way to modify or delete a version', () => {
    const { service } = createService();
    const methods = Object.getOwnPropertyNames(Object.getPrototypeOf(service));

    expect(methods.filter((name) => /update|delete|remove/i.test(name))).toEqual([]);
  });
});
