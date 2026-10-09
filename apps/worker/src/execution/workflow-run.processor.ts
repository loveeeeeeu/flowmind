import { Processor, WorkerHost } from '@nestjs/bullmq';
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
}
