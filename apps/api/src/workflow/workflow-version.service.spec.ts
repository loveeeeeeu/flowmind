import type { PrismaService } from '../prisma/prisma.service.js';
import { WorkflowVersionService } from './workflow-version.service.js';

function createService() {
  const prisma = {
    workflowVersion: {
      findMany: vi.fn(async () => []),
      findUnique: vi.fn(async () => null),
      findFirst: vi.fn(async () => null),
    },
  };

  return { prisma, service: new WorkflowVersionService(prisma as unknown as PrismaService) };
}

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

  it('finds the latest version by the per-workflow version number', async () => {
    const { prisma, service } = createService();

    await service.findLatest('workflow-1');

    expect(prisma.workflowVersion.findFirst).toHaveBeenCalledWith({
      where: { workflowId: 'workflow-1' },
      orderBy: { version: 'desc' },
    });
  });

  it('exposes no way to modify or delete a version', () => {
    const { service } = createService();
    const methods = Object.getOwnPropertyNames(Object.getPrototypeOf(service));

    expect(methods.filter((name) => /update|delete|remove/i.test(name))).toEqual([]);
  });
});
