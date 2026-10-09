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
    return this.queue.add(EXECUTE_WORKFLOW_JOB, { runId }, { jobId: runId });
  }
}
