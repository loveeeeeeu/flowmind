import { Injectable, Logger } from '@nestjs/common';
import { normalizeExecutionError } from '@flowmind/shared';
import { PrismaService } from '../prisma/prisma.service.js';
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

interface RunStateSnapshot {
  id: string;
  status: string;
  heartbeatAt: Date | null;
}

/**
 * Every write here is a conditional update on the expected current status, so
 * duplicate deliveries, recovery sweeps and the executing worker cannot overwrite each other.
 */
@Injectable()
export class RunStateService {
  private readonly logger = new Logger(RunStateService.name);

  constructor(private readonly prisma: PrismaService) {}

  async findRun(runId: string) {
    const run = await this.prisma.workflowRun.findUnique({
      where: { id: runId },
      include: { workflow: true },
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
      this.logger.warn(`Run ${run.id} skipped: already ${run.status}`);
      return 'skip';
    }

    if (run.status === 'RUNNING') {
      if (!this.isStale(run.heartbeatAt)) {
        this.logger.warn(`Run ${run.id} skipped: another worker is still executing it`);
        return 'skip';
      }

      await this.markInterrupted(run.id);
      throw new Error(`Workflow run ${run.id} is stale: its worker stopped before completion`);
    }

    if (!(await this.claimPendingRun(run.id))) {
      this.logger.warn(`Run ${run.id} skipped: claimed by another worker`);
      return 'skip';
    }

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
    await this.finishRunning(runId, {
      status: 'SUCCESS',
      ...(output === undefined ? {} : { output: toJsonInput(output) }),
    });
  }

  async markFailed(runId: string, error: unknown) {
    const { code, message } = normalizeExecutionError(
      error,
      'EXECUTION_ERROR',
      'Workflow execution failed',
    );

    await this.finishRunning(runId, { status: 'FAILED', errorCode: code, errorMessage: message });
  }

  async markInterrupted(runId: string) {
    await this.finishRunning(runId, { status: 'FAILED', ...WORKER_INTERRUPTED_FAILURE });
  }

  isStale(heartbeatAt: Date | null, now = Date.now()) {
    return !heartbeatAt || now - heartbeatAt.getTime() > RUN_STALE_AFTER_MS;
  }

  private async finishRunning(
    runId: string,
    data: {
      status: 'SUCCESS' | 'FAILED';
      output?: ReturnType<typeof toJsonInput>;
      errorCode?: string;
      errorMessage?: string;
    },
  ) {
    const result = await this.prisma.workflowRun.updateMany({
      where: { id: runId, status: 'RUNNING' },
      data: { ...data, finishedAt: new Date() },
    });

    if (result.count === 0) {
      this.logger.warn(`Run ${runId} was no longer RUNNING; ${data.status} result discarded`);
    }
  }
}
