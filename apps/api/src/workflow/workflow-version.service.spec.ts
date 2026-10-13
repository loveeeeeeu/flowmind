import { ConflictException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { WorkflowVersionService } from './workflow-version.service.js';

interface StoredVersion {
  id: string;
  workflowId: string;
  version: number;
  canvas: unknown;
  createdAt: Date;
}

/** In-memory stand-in for the tables the publish transaction touches. */
function createService() {
  const versions: StoredVersion[] = [];
  const workflow = { id: 'workflow-1', status: 'DRAFT' };

  const tx = {
    workflowVersion: {
      findFirst: vi.fn(async ({ where }: { where: { workflowId: string } }) => {
        const own = versions.filter((v) => v.workflowId === where.workflowId);

        return own.sort((a, b) => b.version - a.version)[0] ?? null;
      }),
      create: vi.fn(
        async ({ data }: { data: Omit<StoredVersion, 'id' | 'createdAt'> }) => {
          const stored = {
            ...data,
            id: `version-${versions.length + 1}`,
            createdAt: new Date(),
          };
          versions.push(stored);

          return {
            id: stored.id,
            workflowId: stored.workflowId,
            version: stored.version,
            createdAt: stored.createdAt,
          };
        },
      ),
    },
    workflow: {
      update: vi.fn(async ({ data }: { data: { status: string } }) => {
        workflow.status = data.status;
        return workflow;
      }),
    },
  };

  const prisma = {
    $transaction: vi.fn(async (fn: (client: typeof tx) => Promise<unknown>) => fn(tx)),
    workflowVersion: {
      findMany: vi.fn(async () => []),
      findUnique: vi.fn(async () => null),
      findFirst: vi.fn(async () => null),
    },
  };

  return {
    prisma,
    tx,
    versions,
    workflow,
    service: new WorkflowVersionService(prisma as unknown as PrismaService),
  };
}

const canvasV1 = {
  nodes: [
    { id: 'start', type: 'start', data: {} },
    { id: 'end', type: 'end', data: { outputVariable: 'text' } },
  ],
  edges: [{ source: 'start', target: 'end' }],
};

describe('WorkflowVersionService.publish', () => {
  it('first publish creates v1 and marks the workflow PUBLISHED', async () => {
    const { service, versions, workflow } = createService();

    const result = await service.publish('workflow-1', canvasV1);

    expect(result).toMatchObject({ workflowId: 'workflow-1', version: 1 });
    expect(result).not.toHaveProperty('canvas');
    expect(versions).toHaveLength(1);
    expect(workflow.status).toBe('PUBLISHED');
  });

  it('second publish creates v2 and leaves the v1 snapshot untouched', async () => {
    const { service, versions } = createService();
    const canvasV2 = {
      ...canvasV1,
      nodes: [...canvasV1.nodes, { id: 'tpl', type: 'template', data: {} }],
    };

    await service.publish('workflow-1', canvasV1);
    await service.publish('workflow-1', canvasV2);

    expect(versions.map((v) => v.version)).toEqual([1, 2]);
    expect(versions[0].canvas).toEqual(canvasV1);
    expect(versions[1].canvas).toEqual(canvasV2);
  });

  it('turns a concurrent publish (unique version clash) into 409', async () => {
    const { service, tx } = createService();
    tx.workflowVersion.create.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: 'test',
      }),
    );

    await expect(service.publish('workflow-1', canvasV1)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });
});

describe('WorkflowVersionService', () => {
  it('lists version summaries of one workflow, newest first, without canvas snapshots', async () => {
    const { prisma, service } = createService();

    await service.findByWorkflow('workflow-1');

    expect(prisma.workflowVersion.findMany).toHaveBeenCalledWith({
      where: { workflowId: 'workflow-1' },
      orderBy: { version: 'desc' },
      select: { id: true, workflowId: true, version: true, createdAt: true },
    });
  });

  it('finds the latest version summary by the per-workflow version number', async () => {
    const { prisma, service } = createService();

    await service.findLatest('workflow-1');

    expect(prisma.workflowVersion.findFirst).toHaveBeenCalledWith({
      where: { workflowId: 'workflow-1' },
      orderBy: { version: 'desc' },
      select: { id: true, workflowId: true, version: true, createdAt: true },
    });
  });

  it('exposes no way to modify or delete a version', () => {
    const { service } = createService();
    const methods = Object.getOwnPropertyNames(Object.getPrototypeOf(service));

    expect(methods.filter((name) => /update|delete|remove/i.test(name))).toEqual([]);
  });
});
