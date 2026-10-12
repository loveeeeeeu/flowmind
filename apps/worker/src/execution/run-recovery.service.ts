import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { type ExecuteWorkflowJobData, WORKFLOW_EXECUTION_QUEUE } from '@flowmind/shared';
import type { Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service.js';
import { ExecutionLogService } from './execution-log.service.js';
import { RUN_STALE_AFTER_MS, RunStateService } from './run-state.service.js';

/** Leaves the API enough time to enqueue right after creating the run. */
export const PENDING_SUBMISSION_TIMEOUT_MS = 5 * 60_000;

const LIVE_JOB_STATES = new Set(['waiting', 'delayed', 'prioritized', 'waiting-children', 'active']);

export interface RecoveryResult {
  interrupted: number;
  orphaned: number;
}

/**
 * Fails runs nobody will ever finish. It never re-executes them: with no checkpoint we cannot
 * tell which side effects already happened, so the user decides whether to start a new run.
 */
@Injectable()
export class RunRecoveryService {
  private readonly logger = new Logger(RunRecoveryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly runState: RunStateService,
    private readonly logs: ExecutionLogService,
    @InjectQueue(WORKFLOW_EXECUTION_QUEUE)
    private readonly queue: Queue<ExecuteWorkflowJobData>,
  ) {}

  async recover(now = new Date()): Promise<RecoveryResult> {
    const result = {
      interrupted: await this.failStaleRunning(now),
      orphaned: await this.failOrphanedPending(now),
    };

    if (result.interrupted > 0 || result.orphaned > 0) {
      this.logger.warn(
        `Recovered runs: ${result.interrupted} interrupted, ${result.orphaned} never submitted`,
      );
    }

    return result;
  }

  private async failStaleRunning(now: Date) {
    const threshold = new Date(now.getTime() - RUN_STALE_AFTER_MS);
    const candidates = await this.prisma.workflowRun.findMany({
      where: {
        status: 'RUNNING',
        OR: [{ heartbeatAt: null }, { heartbeatAt: { lt: threshold } }],
      },
      select: { id: true },
    });
    let count = 0;

    for (const { id } of candidates) {
      if (await this.runState.markInterrupted(id, 'recovery-scan')) {
        count += 1;
      }
    }

    return count;
  }

  /**
   * PENDING with no live job = the API crashed between the DB insert and the enqueue (dual write).
   * Old PENDING runs whose job is still queued are only waiting on a backlog or an offline worker.
   */
  private async failOrphanedPending(now: Date) {
    const threshold = new Date(now.getTime() - PENDING_SUBMISSION_TIMEOUT_MS);
    const candidates = await this.prisma.workflowRun.findMany({
      where: { status: 'PENDING', createdAt: { lt: threshold } },
      select: { id: true },
    });
    let count = 0;

    for (const { id } of candidates) {
      if (await this.hasLiveJob(id)) {
        continue;
      }

      const result = await this.prisma.workflowRun.updateMany({
        where: { id, status: 'PENDING' },
        data: {
          status: 'FAILED',
          errorCode: 'QUEUE_SUBMISSION_TIMEOUT',
          errorMessage: 'Workflow run was not picked up for execution',
          finishedAt: now,
        },
      });

      if (result.count === 1) {
        count += 1;
        await this.logs.log({
          workflowRunId: id,
          level: 'ERROR',
          message: '恢复扫描：运行未进入执行队列，已标记为失败',
          metadata: { code: 'QUEUE_SUBMISSION_TIMEOUT' },
        });
      }
    }

    return count;
  }

  private async hasLiveJob(runId: string) {
    const job = await this.queue.getJob(runId);

    return job ? LIVE_JOB_STATES.has(await job.getState()) : false;
  }
}
