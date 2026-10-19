import type { PrismaService } from '../../prisma/prisma.service.js';
import { WorkflowRunService } from './workflow-run.service.js';

function createPrisma() {
  return {
    workflowRun: {
      create: vi.fn(async () => ({ id: 'run-1' })),
      update: vi.fn(async () => undefined),
      findFirst: vi.fn(async () => null),
      findMany: vi.fn(async () => []),
    },
    executionLog: {
      findMany: vi.fn(async () => [{ id: 'log-1' }]),
    },
    nodeRun: {
      findFirst: vi.fn(async () => null),
    },
  };
}

describe('WorkflowRunService', () => {
  it('creates a PUBLISHED run bound to a version, without a draft snapshot', async () => {
    const prisma = createPrisma();
    const service = new WorkflowRunService(prisma as unknown as PrismaService);

    await service.createPublished({
      workflowId: 'workflow-1',
      workflowVersionId: 'version-1',
      input: { topic: 'AI', omit: undefined },
    });

    expect(prisma.workflowRun.create).toHaveBeenCalledWith({
      data: {
        workflowId: 'workflow-1',
        source: 'PUBLISHED',
        workflowVersionId: 'version-1',
        status: 'PENDING',
        input: { topic: 'AI' },
      },
      omit: { draftSnapshot: true },
    });
  });

  it('records the API key that triggered an external run', async () => {
    const prisma = createPrisma();
    const service = new WorkflowRunService(prisma as unknown as PrismaService);

    await service.createPublished({
      workflowId: 'workflow-1',
      workflowVersionId: 'version-1',
      workflowApiKeyId: 'key-1',
      input: {},
    });

    expect(prisma.workflowRun.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ workflowApiKeyId: 'key-1' }) as unknown,
      }),
    );
  });

  it('creates a DRAFT run carrying its own canvas snapshot, without a version', async () => {
    const prisma = createPrisma();
    const service = new WorkflowRunService(prisma as unknown as PrismaService);
    const canvas = { nodes: [{ id: 'start', type: 'start', data: {} }], edges: [] };

    await service.createDraft({ workflowId: 'workflow-1', canvas, input: {} });

    const [[args]] = prisma.workflowRun.create.mock.calls as unknown as [
      [{ data: Record<string, unknown> }],
    ];
    expect(args.data).toEqual({
      workflowId: 'workflow-1',
      source: 'DRAFT',
      draftSnapshot: canvas,
      status: 'PENDING',
      input: {},
    });
    expect(args.data).not.toHaveProperty('workflowVersionId');
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

  it('loads the version summary and node runs in execution order, retries of a step by attempt', async () => {
    const prisma = createPrisma();
    const service = new WorkflowRunService(prisma as unknown as PrismaService);

    await service.findOne('project-1', 'run-1');

    expect(prisma.workflowRun.findFirst).toHaveBeenCalledWith({
      where: { id: 'run-1', workflow: { projectId: 'project-1' } },
      omit: { draftSnapshot: true },
      include: {
        workflowVersion: { select: { id: true, version: true, createdAt: true } },
        workflowApiKey: { select: { id: true, name: true, prefix: true } },
        nodeRuns: {
          orderBy: [{ sequence: 'asc' }, { attempt: 'asc' }],
          select: {
            id: true,
            workflowRunId: true,
            nodeId: true,
            nodeType: true,
            status: true,
            sequence: true,
            iteration: true,
            attempt: true,
            errorCode: true,
            errorMessage: true,
            startedAt: true,
            finishedAt: true,
            createdAt: true,
          },
        },
      },
    });
  });

  it('returns a project-scoped, sanitised NodeRun debug projection', async () => {
    const prisma = createPrisma();
    prisma.nodeRun.findFirst.mockResolvedValueOnce({
      id: 'node-run-1', workflowRunId: 'run-1', nodeId: 'http', nodeType: 'http', sequence: 2, attempt: 1,
      status: 'FAILED', input: { headers: { Authorization: 'Bearer secret' } }, output: { token: 'hidden' },
      errorCode: 'AUTH_ERROR', errorMessage: 'Invalid API key', startedAt: new Date('2026-10-19T10:00:00Z'),
      finishedAt: new Date('2026-10-19T10:00:01Z'),
      logs: [{ id: 'log-1', level: 'ERROR', message: 'Request failed', metadata: { apiKey: 'hidden' }, createdAt: new Date('2026-10-19T10:00:01Z') }],
    } as never);
    const service = new WorkflowRunService(prisma as unknown as PrismaService);

    await expect(service.findNodeRunDebug('project-1', 'run-1', 'node-run-1')).resolves.toMatchObject({
      id: 'node-run-1',
      runId: 'run-1',
      durationMs: 1000,
      input: { headers: { Authorization: '[REDACTED]' } },
      output: { token: '[REDACTED]' },
      error: { code: 'AUTH_ERROR', message: 'Invalid API key' },
      logs: [{ id: 'log-1', metadata: { apiKey: '[REDACTED]' } }],
    });
    expect(prisma.nodeRun.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'node-run-1', workflowRunId: 'run-1', workflowRun: { workflow: { projectId: 'project-1' } } },
    }));
  });

  it('does not reveal a NodeRun outside the selected project and run', async () => {
    const service = new WorkflowRunService(createPrisma() as unknown as PrismaService);

    await expect(service.findNodeRunDebug('project-a', 'run-a', 'node-run-b')).rejects.toMatchObject({ status: 404 });
  });

  it('loads at most 500 logs of an existing run, oldest first with a stable tie-break', async () => {
    const prisma = createPrisma();
    prisma.workflowRun.findFirst.mockResolvedValueOnce({ id: 'run-1' } as never);
    const service = new WorkflowRunService(prisma as unknown as PrismaService);

    await expect(service.findLogs('project-1', 'run-1')).resolves.toEqual([{ id: 'log-1' }]);

    expect(prisma.executionLog.findMany).toHaveBeenCalledWith({
      where: { workflowRunId: 'run-1' },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: 500,
    });
  });

  it('returns null for the logs of a missing run so the controller can 404', async () => {
    const prisma = createPrisma();
    const service = new WorkflowRunService(prisma as unknown as PrismaService);

    await expect(service.findLogs('project-1', 'missing')).resolves.toBeNull();
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
        source: true,
        status: true,
        errorCode: true,
        errorMessage: true,
        startedAt: true,
        finishedAt: true,
        createdAt: true,
        workflowVersion: { select: { id: true, version: true } },
        workflowApiKey: { select: { id: true, name: true, prefix: true } },
      },
    });
  });
});
