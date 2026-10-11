import type { ExecuteWorkflowJobData } from '@flowmind/shared';
import type { Queue } from 'bullmq';
import type { PrismaService } from '../prisma/prisma.service.js';
import { PENDING_SUBMISSION_TIMEOUT_MS, RunRecoveryService } from './run-recovery.service.js';
import { RUN_STALE_AFTER_MS } from './run-state.service.js';

const now = new Date('2026-10-11T08:00:00.000Z');

function setup(pendingIds: string[], jobStates: Record<string, string>) {
  const prisma = {
    workflowRun: {
      updateMany: vi.fn(async (args: { where: { status: string } }) => ({
        count: args.where.status === 'RUNNING' ? 2 : 1,
      })),
      findMany: vi.fn(async () => pendingIds.map((id) => ({ id }))),
    },
  };
  const queue = {
    getJob: vi.fn(async (id: string) =>
      jobStates[id] ? { getState: async () => jobStates[id] } : undefined,
    ),
  };
  const service = new RunRecoveryService(
    prisma as unknown as PrismaService,
    queue as unknown as Queue<ExecuteWorkflowJobData>,
  );

  return { prisma, service };
}

describe('RunRecoveryService', () => {
  it('fails RUNNING runs whose heartbeat is missing or stale', async () => {
    const { prisma, service } = setup([], {});

    const result = await service.recover(now);

    expect(result.interrupted).toBe(2);
    expect(prisma.workflowRun.updateMany).toHaveBeenCalledWith({
      where: {
        status: 'RUNNING',
        OR: [
          { heartbeatAt: null },
          { heartbeatAt: { lt: new Date(now.getTime() - RUN_STALE_AFTER_MS) } },
        ],
      },
      data: {
        status: 'FAILED',
        errorCode: 'WORKER_INTERRUPTED',
        errorMessage: 'Workflow worker stopped before execution completed',
        finishedAt: now,
      },
    });
  });

  it('fails old PENDING runs that have no live queue job, keeps the ones still queued', async () => {
    const { prisma, service } = setup(['orphan', 'finished-job', 'queued'], {
      'finished-job': 'completed',
      queued: 'waiting',
    });

    const result = await service.recover(now);

    expect(prisma.workflowRun.findMany).toHaveBeenCalledWith({
      where: {
        status: 'PENDING',
        createdAt: { lt: new Date(now.getTime() - PENDING_SUBMISSION_TIMEOUT_MS) },
      },
      select: { id: true },
    });
    expect(result.orphaned).toBe(2);

    const failedPendingIds = prisma.workflowRun.updateMany.mock.calls
      .map(([args]) => args.where)
      .filter((where) => where.status === 'PENDING')
      .map((where) => (where as { id?: string }).id);
    expect(failedPendingIds).toEqual(['orphan', 'finished-job']);
    expect(prisma.workflowRun.updateMany).toHaveBeenCalledWith({
      where: { id: 'orphan', status: 'PENDING' },
      data: {
        status: 'FAILED',
        errorCode: 'QUEUE_SUBMISSION_TIMEOUT',
        errorMessage: 'Workflow run was not picked up for execution',
        finishedAt: now,
      },
    });
  });
});
