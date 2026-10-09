import { Injectable } from '@nestjs/common';
import { ExecutionQueueService } from './queue/execution-queue.service.js';
import { WorkflowRunService } from './run/workflow-run.service.js';

export interface CreateWorkflowRunParams {
  workflowId: string;
  input: Record<string, unknown>;
}

@Injectable()
export class ExecutionService {
  constructor(
    private readonly runs: WorkflowRunService,
    private readonly queue: ExecutionQueueService,
  ) {}

  async createRun(params: CreateWorkflowRunParams) {
    const run = await this.runs.create(params.workflowId, params.input);

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
