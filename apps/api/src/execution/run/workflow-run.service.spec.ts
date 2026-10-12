import type { PrismaService } from '../../prisma/prisma.service.js';
import { WorkflowRunService } from './workflow-run.service.js';

function createPrisma() {
  return {
    workflowRun: {
      create: vi.fn(async () => ({ id: 'run-1' })),
      update: vi.fn(async () => undefined),
      findUnique: vi.fn(async () => null),
      findMany: vi.fn(async () => []),
    },
    executionLog: {
      findMany: vi.fn(async () => [{ id: 'log-1' }]),
    },
  };
}

describe('WorkflowRunService', () => {
  it('creates a pending run and snapshots its input as JSON', async () => {
    const prisma = createPrisma();
    const service = new WorkflowRunService(prisma as unknown as PrismaService);

    await service.create('workflow-1', { topic: 'AI', omit: undefined });

    expect(prisma.workflowRun.create).toHaveBeenCalledWith({
      data: {
        workflowId: 'workflow-1',
        status: 'PENDING',
        input: { topic: 'AI' },
      },
    });
  });

  it('marks a run failed when it cannot be enqueued', async () => {
    const prisma = createPrisma();
    const service = new WorkflowRunService(prisma as unknown as PrismaService);

    await service.markFailed('run-1', new Error('Redis connection refused'));

    expect(prisma.workflowRun.update).toHaveBeenCalledWith({
      where: { id: 'run-1' },
      data: {
        status: 'FAILED',
        errorCode: 'EXECUTION_ERROR',
        errorMessage: 'Redis connection refused',
        finishedAt: expect.any(Date),
      },
    });
  });

  it('loads node runs in execution order, retries of a step by attempt', async () => {
    const prisma = createPrisma();
    const service = new WorkflowRunService(prisma as unknown as PrismaService);

    await service.findOne('run-1');

    expect(prisma.workflowRun.findUnique).toHaveBeenCalledWith({
      where: { id: 'run-1' },
      include: { nodeRuns: { orderBy: [{ sequence: 'asc' }, { attempt: 'asc' }] } },
    });
  });

  it('loads at most 500 logs of an existing run, oldest first with a stable tie-break', async () => {
    const prisma = createPrisma();
    prisma.workflowRun.findUnique.mockResolvedValueOnce({ id: 'run-1' } as never);
    const service = new WorkflowRunService(prisma as unknown as PrismaService);

    await expect(service.findLogs('run-1')).resolves.toEqual([{ id: 'log-1' }]);

    expect(prisma.executionLog.findMany).toHaveBeenCalledWith({
      where: { workflowRunId: 'run-1' },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: 500,
    });
  });

  it('returns null for the logs of a missing run so the controller can 404', async () => {
    const prisma = createPrisma();
    const service = new WorkflowRunService(prisma as unknown as PrismaService);

    await expect(service.findLogs('missing')).resolves.toBeNull();
    expect(prisma.executionLog.findMany).not.toHaveBeenCalled();
  });

  it('lists the latest 50 run summaries of a workflow', async () => {
    const prisma = createPrisma();
    const service = new WorkflowRunService(prisma as unknown as PrismaService);

    await service.findByWorkflow('workflow-1');

    expect(prisma.workflowRun.findMany).toHaveBeenCalledWith({
      where: { workflowId: 'workflow-1' },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        id: true,
        workflowId: true,
        status: true,
        errorCode: true,
        errorMessage: true,
        startedAt: true,
        finishedAt: true,
        createdAt: true,
      },
    });
  });
});
