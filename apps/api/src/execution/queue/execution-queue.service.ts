import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import {
  EXECUTE_WORKFLOW_JOB,
  type ExecuteWorkflowJobData,
  WORKFLOW_EXECUTION_QUEUE,
} from '@flowmind/shared';
import type { Queue } from 'bullmq';

@Injectable()
export class ExecutionQueueService {
  constructor(
    @InjectQueue(WORKFLOW_EXECUTION_QUEUE)
    private readonly queue: Queue<ExecuteWorkflowJobData>,
  ) {}

  enqueueRun(runId: string) {
    // attempts: 1 — a whole-job retry restarts from Start and would repeat side effects of
    // nodes that already succeeded (e.g. an HTTP POST); retries happen per node instead.
    return this.queue.add(EXECUTE_WORKFLOW_JOB, { runId }, { jobId: runId, attempts: 1 });
  }
}
