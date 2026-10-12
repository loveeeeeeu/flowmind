import type { ExecuteWorkflowJobData } from '@flowmind/shared';
import type { Queue } from 'bullmq';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { ExecutionLogService } from './execution-log.service.js';
import { PENDING_SUBMISSION_TIMEOUT_MS, RunRecoveryService } from './run-recovery.service.js';
import { RUN_STALE_AFTER_MS, type RunStateService } from './run-state.service.js';

const now = new Date('2026-10-11T08:00:00.000Z');

interface SetupOptions {
  staleIds?: string[];
  pendingIds?: string[];
  jobStates?: Record<string, string>;
  interruptedIds?: string[];
}

function setup({
  staleIds = [],
  pendingIds = [],
  jobStates = {},
  interruptedIds = staleIds,
}: SetupOptions) {
  const prisma = {
    workflowRun: {
      updateMany: vi.fn(async (_args: { where: { id: string } }) => ({ count: 1 })),
      findMany: vi.fn(async (args: { where: { status: string } }) =>
        (args.where.status === 'RUNNING' ? staleIds : pendingIds).map((id) => ({ id })),
      ),
    },
  };
  const runState = {
    markInterrupted: vi.fn(async (id: string) => interruptedIds.includes(id)),
  };
  const logs = { log: vi.fn(async () => undefined) };
  const queue = {
    getJob: vi.fn(async (id: string) =>
      jobStates[id] ? { getState: async () => jobStates[id] } : undefined,
    ),
  };
  const service = new RunRecoveryService(
    prisma as unknown as PrismaService,
    runState as unknown as RunStateService,
    logs as unknown as ExecutionLogService,
    queue as unknown as Queue<ExecuteWorkflowJobData>,
  );

  return { prisma, runState, logs, service };
}

describe('RunRecoveryService', () => {
  it('fails each RUNNING run whose heartbeat is missing or stale through RunStateService', async () => {
    // 'finished-meanwhile' completed between the query and the conditional update.
    const { prisma, runState, service } = setup({
      staleIds: ['stale-1', 'stale-2', 'finished-meanwhile'],
      interruptedIds: ['stale-1', 'stale-2'],
    });

    const result = await service.recover(now);

    expect(prisma.workflowRun.findMany).toHaveBeenCalledWith({
      where: {
        status: 'RUNNING',
        OR: [
          { heartbeatAt: null },
          { heartbeatAt: { lt: new Date(now.getTime() - RUN_STALE_AFTER_MS) } },
        ],
      },
      select: { id: true },
    });
    expect(runState.markInterrupted.mock.calls).toEqual([
      ['stale-1', 'recovery-scan'],
      ['stale-2', 'recovery-scan'],
      ['finished-meanwhile', 'recovery-scan'],
    ]);
    expect(result.interrupted).toBe(2);
  });

  it('fails old PENDING runs that have no live queue job, keeps the ones still queued', async () => {
    const { prisma, logs, service } = setup({
      pendingIds: ['orphan', 'finished-job', 'queued'],
      jobStates: { 'finished-job': 'completed', queued: 'waiting' },
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
    expect(prisma.workflowRun.updateMany.mock.calls.map(([args]) => args.where.id)).toEqual([
      'orphan',
      'finished-job',
    ]);
    expect(prisma.workflowRun.updateMany).toHaveBeenCalledWith({
      where: { id: 'orphan', status: 'PENDING' },
      data: {
        status: 'FAILED',
        errorCode: 'QUEUE_SUBMISSION_TIMEOUT',
        errorMessage: 'Workflow run was not picked up for execution',
        finishedAt: now,
      },
    });
    expect(logs.log).toHaveBeenCalledTimes(2);
    expect(logs.log).toHaveBeenCalledWith(
      expect.objectContaining({
        workflowRunId: 'orphan',
        level: 'ERROR',
        metadata: { code: 'QUEUE_SUBMISSION_TIMEOUT' },
      }),
    );
  });
});
