import type { PrismaService } from '../prisma/prisma.service.js';
import {
  RUN_HEARTBEAT_INTERVAL_MS,
  RUN_STALE_AFTER_MS,
  RunStateService,
} from './run-state.service.js';

function createPrisma(claimCount = 1) {
  return {
    workflowRun: {
      findUnique: vi.fn(async () => null),
      updateMany: vi.fn(async () => ({ count: claimCount })),
    },
  };
}

function createService(prisma = createPrisma()) {
  return { prisma, service: new RunStateService(prisma as unknown as PrismaService) };
}

function secondsAgo(seconds: number) {
  return new Date(Date.now() - seconds * 1000);
}

describe('RunStateService', () => {
  describe('prepareForExecution', () => {
    it('claims a PENDING run with a conditional update and starts its heartbeat clock', async () => {
      const { prisma, service } = createService();

      await expect(
        service.prepareForExecution({ id: 'run-1', status: 'PENDING', heartbeatAt: null }),
      ).resolves.toBe('execute');

      expect(prisma.workflowRun.updateMany).toHaveBeenCalledWith({
        where: { id: 'run-1', status: 'PENDING' },
        data: { status: 'RUNNING', startedAt: expect.any(Date), heartbeatAt: expect.any(Date) },
      });
    });

    it('skips when another worker won the claim (count = 0)', async () => {
      const { service } = createService(createPrisma(0));

      await expect(
        service.prepareForExecution({ id: 'run-1', status: 'PENDING', heartbeatAt: null }),
      ).resolves.toBe('skip');
    });

    it.each(['SUCCESS', 'FAILED', 'CANCELLED'])('skips a run that is already %s', async (status) => {
      const { prisma, service } = createService();

      await expect(
        service.prepareForExecution({ id: 'run-1', status, heartbeatAt: null }),
      ).resolves.toBe('skip');
      expect(prisma.workflowRun.updateMany).not.toHaveBeenCalled();
    });

    it('leaves a RUNNING run with a fresh heartbeat alone', async () => {
      const { prisma, service } = createService();

      await expect(
        service.prepareForExecution({ id: 'run-1', status: 'RUNNING', heartbeatAt: secondsAgo(5) }),
      ).resolves.toBe('skip');
      expect(prisma.workflowRun.updateMany).not.toHaveBeenCalled();
    });

    it('fails a stale RUNNING run as WORKER_INTERRUPTED instead of re-executing it', async () => {
      const { prisma, service } = createService();

      await expect(
        service.prepareForExecution({ id: 'run-1', status: 'RUNNING', heartbeatAt: secondsAgo(120) }),
      ).rejects.toThrow('Workflow run run-1 is stale');

      expect(prisma.workflowRun.updateMany).toHaveBeenCalledWith({
        where: { id: 'run-1', status: 'RUNNING' },
        data: {
          status: 'FAILED',
          errorCode: 'WORKER_INTERRUPTED',
          errorMessage: 'Workflow worker stopped before execution completed',
          finishedAt: expect.any(Date),
        },
      });
    });
  });

  it('treats a missing or old heartbeat as stale', () => {
    const { service } = createService();
    const now = Date.now();

    expect(service.isStale(null, now)).toBe(true);
    expect(service.isStale(new Date(now - RUN_STALE_AFTER_MS - 1), now)).toBe(true);
    expect(service.isStale(new Date(now - RUN_STALE_AFTER_MS + 1000), now)).toBe(false);
  });

  it('refreshes the heartbeat periodically until stopped', async () => {
    vi.useFakeTimers();

    try {
      const { prisma, service } = createService();
      const stop = service.startHeartbeat('run-1');

      await vi.advanceTimersByTimeAsync(RUN_HEARTBEAT_INTERVAL_MS * 2);
      stop();
      await vi.advanceTimersByTimeAsync(RUN_HEARTBEAT_INTERVAL_MS * 2);

      expect(prisma.workflowRun.updateMany).toHaveBeenCalledTimes(2);
      expect(prisma.workflowRun.updateMany).toHaveBeenCalledWith({
        where: { id: 'run-1', status: 'RUNNING' },
        data: { heartbeatAt: expect.any(Date) },
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it('only finishes runs that are still RUNNING', async () => {
    const { prisma, service } = createService();

    await service.markSuccess('run-1', { result: 'Hello' });
    await service.markFailed(
      'run-1',
      Object.assign(new Error('Rate limit'), { code: 'RATE_LIMIT' }),
    );

    expect(prisma.workflowRun.updateMany).toHaveBeenNthCalledWith(1, {
      where: { id: 'run-1', status: 'RUNNING' },
      data: { status: 'SUCCESS', output: { result: 'Hello' }, finishedAt: expect.any(Date) },
    });
    expect(prisma.workflowRun.updateMany).toHaveBeenNthCalledWith(2, {
      where: { id: 'run-1', status: 'RUNNING' },
      data: {
        status: 'FAILED',
        errorCode: 'RATE_LIMIT',
        errorMessage: 'Rate limit',
        finishedAt: expect.any(Date),
      },
    });
  });
});
