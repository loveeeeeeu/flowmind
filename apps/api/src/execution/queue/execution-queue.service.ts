import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import type { Queue } from 'bullmq';
import {
  EXECUTE_WORKFLOW_JOB,
  WORKFLOW_EXECUTION_QUEUE,
} from './execution-queue.constants.js';
import type { ExecuteWorkflowJobData } from './execution-queue.types.js';

@Injectable()
export class ExecutionQueueService {
  constructor(
    @InjectQueue(WORKFLOW_EXECUTION_QUEUE)
    private readonly queue: Queue<ExecuteWorkflowJobData>,
  ) {}

  enqueueRun(runId: string) {
    return this.queue.add(EXECUTE_WORKFLOW_JOB, { runId }, { jobId: runId });
  }
}
