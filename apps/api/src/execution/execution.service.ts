import { Injectable } from '@nestjs/common';
import { ExecutionQueueService } from './queue/execution-queue.service.js';
import { type CreateRunRecordParams, WorkflowRunService } from './run/workflow-run.service.js';

export type CreateWorkflowRunParams = CreateRunRecordParams;

@Injectable()
export class ExecutionService {
  constructor(
    private readonly runs: WorkflowRunService,
    private readonly queue: ExecutionQueueService,
  ) {}

  /** The job still carries only the run id; the worker loads the bound version from the row. */
  async createRun(params: CreateWorkflowRunParams) {
    const run = await this.runs.create(params);

    try {
      await this.queue.enqueueRun(run.id);
      return run;
    } catch (error) {
      await this.runs.markFailed(run.id, error);
      throw error;
    }
  }

  findWorkflowRuns(workflowId: string) {
    return this.runs.findByWorkflow(workflowId);
  }
}
