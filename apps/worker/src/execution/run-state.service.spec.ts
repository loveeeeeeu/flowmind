import type { PrismaService } from '../prisma/prisma.service.js';
import type { ExecutionLogService } from './execution-log.service.js';
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
  const logs = { log: vi.fn(async () => undefined) };
  const service = new RunStateService(
    prisma as unknown as PrismaService,
    logs as unknown as ExecutionLogService,
  );

  return { prisma, logs, service };
}

function secondsAgo(seconds: number) {
  return new Date(Date.now() - seconds * 1000);
}

describe('RunStateService', () => {
  describe('prepareForExecution', () => {
    it('claims a PENDING run with a conditional update and logs the start with its version', async () => {
      const { prisma, logs, service } = createService();

      await expect(
        service.prepareForExecution({
          id: 'run-1',
          status: 'PENDING',
          heartbeatAt: null,
          source: 'PUBLISHED',
          workflowVersion: { id: 'version-2', version: 2 },
        }),
      ).resolves.toBe('execute');

      expect(prisma.workflowRun.updateMany).toHaveBeenCalledWith({
        where: { id: 'run-1', status: 'PENDING' },
        data: { status: 'RUNNING', startedAt: expect.any(Date), heartbeatAt: expect.any(Date) },
      });
      expect(logs.log).toHaveBeenCalledWith({
        workflowRunId: 'run-1',
        message: '开始运行',
        metadata: {
          workerPid: process.pid,
          source: 'PUBLISHED',
          workflowVersionId: 'version-2',
          version: 2,
        },
      });
    });

    it('logs a draft test run start with its source and no version', async () => {
      const { logs, service } = createService();

      await service.prepareForExecution({
        id: 'run-1',
        status: 'PENDING',
        heartbeatAt: null,
        source: 'DRAFT',
        workflowVersion: null,
      });

      expect(logs.log).toHaveBeenCalledWith({
        workflowRunId: 'run-1',
        message: '开始运行',
        metadata: { workerPid: process.pid, source: 'DRAFT' },
      });
    });

    it('skips when another worker won the claim (count = 0)', async () => {
      const { logs, service } = createService(createPrisma(0));

      await expect(
        service.prepareForExecution({ id: 'run-1', status: 'PENDING', heartbeatAt: null }),
      ).resolves.toBe('skip');
      expect(logs.log).toHaveBeenCalledWith(expect.objectContaining({ level: 'WARN' }));
      expect(logs.log).not.toHaveBeenCalledWith(expect.objectContaining({ message: '开始运行' }));
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
      const { prisma, logs, service } = createService();

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
      expect(logs.log).toHaveBeenCalledWith(
        expect.objectContaining({
          level: 'ERROR',
          metadata: { code: 'WORKER_INTERRUPTED', detectedBy: 'redelivery' },
        }),
      );
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

  it('only finishes runs that are still RUNNING, and logs the outcome', async () => {
    const { prisma, logs, service } = createService();

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
    expect(logs.log).toHaveBeenNthCalledWith(1, { workflowRunId: 'run-1', message: '运行成功' });
    expect(logs.log).toHaveBeenNthCalledWith(2, {
      workflowRunId: 'run-1',
      level: 'ERROR',
      message: '运行失败',
      metadata: { code: 'RATE_LIMIT', message: 'Rate limit' },
    });
  });

  it('does not log an outcome that lost the race (run no longer RUNNING)', async () => {
    const { logs, service } = createService(createPrisma(0));

    await service.markSuccess('run-1', 'late');
    await service.markFailed('run-1', new Error('late'));

    expect(logs.log).not.toHaveBeenCalled();
  });
});
