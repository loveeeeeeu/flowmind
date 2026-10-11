import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import {
  EXECUTE_WORKFLOW_JOB,
  type ExecuteWorkflowJobData,
  WORKFLOW_EXECUTION_QUEUE,
} from '@flowmind/shared';
import type { Job } from 'bullmq';
import { WorkflowExecutionService } from './workflow-execution.service.js';

@Processor(WORKFLOW_EXECUTION_QUEUE, { concurrency: 1 })
export class WorkflowRunProcessor extends WorkerHost {
  private readonly logger = new Logger(WorkflowRunProcessor.name);

  constructor(private readonly execution: WorkflowExecutionService) {
    super();
  }

  async process(job: Job<ExecuteWorkflowJobData>) {
    if (job.name !== EXECUTE_WORKFLOW_JOB) {
      throw new Error(`Unsupported job: ${job.name}`);
    }

    this.logger.log(`Processing run ${job.data.runId}`);
    await this.execution.executeRun(job.data.runId);
  }

  @OnWorkerEvent('completed')
  onCompleted(job: Job<ExecuteWorkflowJobData>) {
    this.logger.log(`Job for run ${job.data.runId} completed`);
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job<ExecuteWorkflowJobData> | undefined, error: Error) {
    this.logger.warn(`Job for run ${job?.data.runId ?? 'unknown'} failed: ${error.message}`);
  }

  // Stalled = the lock holder stopped renewing (crash, kill, blocked event loop); BullMQ will
  // hand the job out again, so the same run may arrive twice.
  @OnWorkerEvent('stalled')
  onStalled(jobId: string) {
    this.logger.warn(`Job ${jobId} stalled and will be redelivered`);
  }
}
