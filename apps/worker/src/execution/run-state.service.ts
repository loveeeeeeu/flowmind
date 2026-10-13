import { Injectable, Logger } from '@nestjs/common';
import { normalizeExecutionError } from '@flowmind/shared';
import { PrismaService } from '../prisma/prisma.service.js';
import { ExecutionLogService } from './execution-log.service.js';
import { toJsonInput } from './json-value.js';

export const RUN_HEARTBEAT_INTERVAL_MS = 10_000;
/** Several missed heartbeats in a row: the worker that claimed the run is presumed dead. */
export const RUN_STALE_AFTER_MS = 60_000;

export const WORKER_INTERRUPTED_FAILURE = {
  errorCode: 'WORKER_INTERRUPTED',
  errorMessage: 'Workflow worker stopped before execution completed',
} as const;

const TERMINAL_STATUSES = new Set(['SUCCESS', 'FAILED', 'CANCELLED']);

export type RunExecutionDecision = 'execute' | 'skip';

/** Who noticed the dead worker: a redelivered job or the periodic recovery scan. */
export type InterruptionSource = 'redelivery' | 'recovery-scan';

interface RunStateSnapshot {
  id: string;
  status: string;
  heartbeatAt: Date | null;
  workflowVersion?: { id: string; version: number } | null;
}

/**
 * Every write here is a conditional update on the expected current status, so
 * duplicate deliveries, recovery sweeps and the executing worker cannot overwrite each other.
 * Run-level execution logs are only written for transitions that actually happened.
 */
@Injectable()
export class RunStateService {
  private readonly logger = new Logger(RunStateService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly logs: ExecutionLogService,
  ) {}

  async findRun(runId: string) {
    const run = await this.prisma.workflowRun.findUnique({
      where: { id: runId },
      // The bound version is the only canvas a run may execute; the draft is not loaded at all.
      include: {
        workflowVersion: { select: { id: true, version: true, canvas: true } },
      },
    });

    if (!run) {
      throw new Error(`Workflow run ${runId} not found`);
    }

    return run;
  }

  /**
   * A stale RUNNING run is failed rather than re-executed: nodes before the crash may already
   * have caused side effects (HTTP POST, emails, billed LLM calls), so the user starts a new run.
   */
  async prepareForExecution(run: RunStateSnapshot): Promise<RunExecutionDecision> {
    if (TERMINAL_STATUSES.has(run.status)) {
      await this.skip(run.id, `already ${run.status}`, '重复投递已忽略：运行已结束');
      return 'skip';
    }

    if (run.status === 'RUNNING') {
      if (!this.isStale(run.heartbeatAt)) {
        await this.skip(
          run.id,
          'another worker is still executing it',
          '重复投递已忽略：运行仍在其他 Worker 上执行',
        );
        return 'skip';
      }

      await this.markInterrupted(run.id, 'redelivery');
      throw new Error(`Workflow run ${run.id} is stale: its worker stopped before completion`);
    }

    if (!(await this.claimPendingRun(run.id))) {
      await this.skip(run.id, 'claimed by another worker', '重复投递已忽略：运行已被其他 Worker 领取');
      return 'skip';
    }

    await this.logs.log({
      workflowRunId: run.id,
      message: '开始运行',
      metadata: {
        workerPid: process.pid,
        workflowVersionId: run.workflowVersion?.id ?? null,
        version: run.workflowVersion?.version ?? null,
      },
    });

    return 'execute';
  }

  /** Compare-and-set: count === 1 means this worker won the PENDING -> RUNNING transition. */
  async claimPendingRun(runId: string): Promise<boolean> {
    const now = new Date();
    const result = await this.prisma.workflowRun.updateMany({
      where: { id: runId, status: 'PENDING' },
      data: { status: 'RUNNING', startedAt: now, heartbeatAt: now },
    });

    return result.count === 1;
  }

  /** Returns a stop function; must be called once execution ends, whatever the outcome. */
  startHeartbeat(runId: string): () => void {
    const timer = setInterval(() => {
      this.prisma.workflowRun
        .updateMany({
          where: { id: runId, status: 'RUNNING' },
          data: { heartbeatAt: new Date() },
        })
        .catch((error: unknown) => {
          this.logger.warn(`Heartbeat for run ${runId} failed: ${String(error)}`);
        });
    }, RUN_HEARTBEAT_INTERVAL_MS);

    return () => clearInterval(timer);
  }

  async markSuccess(runId: string, output: unknown) {
    const finished = await this.finishRunning(runId, {
      status: 'SUCCESS',
      ...(output === undefined ? {} : { output: toJsonInput(output) }),
    });

    if (finished) {
      await this.logs.log({ workflowRunId: runId, message: '运行成功' });
    }
  }

  async markFailed(runId: string, error: unknown) {
    const { code, message } = normalizeExecutionError(
      error,
      'EXECUTION_ERROR',
      'Workflow execution failed',
    );
    const finished = await this.finishRunning(runId, {
      status: 'FAILED',
      errorCode: code,
      errorMessage: message,
    });

    if (finished) {
      await this.logs.log({
        workflowRunId: runId,
        level: 'ERROR',
        message: '运行失败',
        metadata: { code, message },
      });
    }
  }

  async markInterrupted(runId: string, detectedBy: InterruptionSource): Promise<boolean> {
    const finished = await this.finishRunning(runId, {
      status: 'FAILED',
      ...WORKER_INTERRUPTED_FAILURE,
    });

    if (finished) {
      await this.logs.log({
        workflowRunId: runId,
        level: 'ERROR',
        message: '执行中断：Worker 心跳超时，运行已标记为失败',
        metadata: { code: WORKER_INTERRUPTED_FAILURE.errorCode, detectedBy },
      });
    }

    return finished;
  }

  isStale(heartbeatAt: Date | null, now = Date.now()) {
    return !heartbeatAt || now - heartbeatAt.getTime() > RUN_STALE_AFTER_MS;
  }

  private async skip(runId: string, reason: string, logMessage: string) {
    this.logger.warn(`Run ${runId} skipped: ${reason}`);
    await this.logs.log({ workflowRunId: runId, level: 'WARN', message: logMessage });
  }

  private async finishRunning(
    runId: string,
    data: {
      status: 'SUCCESS' | 'FAILED';
      output?: ReturnType<typeof toJsonInput>;
      errorCode?: string;
      errorMessage?: string;
    },
  ): Promise<boolean> {
    const result = await this.prisma.workflowRun.updateMany({
      where: { id: runId, status: 'RUNNING' },
      data: { ...data, finishedAt: new Date() },
    });

    if (result.count === 0) {
      this.logger.warn(`Run ${runId} was no longer RUNNING; ${data.status} result discarded`);
    }

    return result.count === 1;
  }
}
