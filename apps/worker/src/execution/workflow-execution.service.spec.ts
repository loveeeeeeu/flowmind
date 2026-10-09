import type { ExecutionObserver, WorkflowEngine } from '@flowmind/workflow-core';
import type { PrismaService } from '../prisma/prisma.service.js';
import { PrismaExecutionObserver } from './prisma-execution-observer.js';
import { WorkflowExecutionService } from './workflow-execution.service.js';

const canvas = { nodes: [], edges: [] };

function createPrisma(run: Record<string, unknown> | null = {
  id: 'run-1',
  status: 'PENDING',
  input: { name: 'FlowMind' },
  workflow: { canvas },
}) {
  return {
    workflowRun: {
      findUnique: vi.fn(async () => run),
      updateMany: vi.fn(async () => ({ count: run?.status === 'PENDING' ? 1 : 0 })),
      update: vi.fn(async () => undefined),
    },
  };
}

function createService(prisma: ReturnType<typeof createPrisma>, execute: ReturnType<typeof vi.fn>) {
  return new WorkflowExecutionService(
    prisma as unknown as PrismaService,
    { execute } as unknown as WorkflowEngine,
  );
}

describe('WorkflowExecutionService', () => {
  it('claims a pending run, executes it with an observer and marks it successful', async () => {
    const prisma = createPrisma();
    const execute = vi.fn(async () => ({ result: { result: 'Hello FlowMind' } }));

    await createService(prisma, execute).executeRun('run-1');

    expect(prisma.workflowRun.updateMany).toHaveBeenCalledWith({
      where: { id: 'run-1', status: 'PENDING' },
      data: { status: 'RUNNING', startedAt: expect.any(Date) },
    });
    expect(execute).toHaveBeenCalledWith(canvas, { name: 'FlowMind' }, {
      observer: expect.any(PrismaExecutionObserver) as ExecutionObserver,
    });
    expect(prisma.workflowRun.update).toHaveBeenCalledWith({
      where: { id: 'run-1' },
      data: {
        status: 'SUCCESS',
        output: { result: 'Hello FlowMind' },
        finishedAt: expect.any(Date),
      },
    });
  });

  it('marks the run failed and rethrows so BullMQ records the job as failed', async () => {
    const prisma = createPrisma();
    const execute = vi.fn(async () => {
      throw Object.assign(new Error('Variable "missing" not found'), { code: 'VARIABLE_ERROR' });
    });

    await expect(createService(prisma, execute).executeRun('run-1')).rejects.toThrow(
      'Variable "missing" not found',
    );

    expect(prisma.workflowRun.update).toHaveBeenCalledWith({
      where: { id: 'run-1' },
      data: {
        status: 'FAILED',
        errorCode: 'VARIABLE_ERROR',
        errorMessage: 'Variable "missing" not found',
        finishedAt: expect.any(Date),
      },
    });
  });

  it('skips a run that is no longer pending', async () => {
    const prisma = createPrisma({ id: 'run-1', status: 'SUCCESS', input: {}, workflow: { canvas } });
    const execute = vi.fn();

    await createService(prisma, execute).executeRun('run-1');

    expect(execute).not.toHaveBeenCalled();
    expect(prisma.workflowRun.update).not.toHaveBeenCalled();
  });

  it('throws when the run does not exist', async () => {
    const prisma = createPrisma(null);

    await expect(createService(prisma, vi.fn()).executeRun('missing')).rejects.toThrow(
      'Workflow run missing not found',
    );
  });
});
