import { Injectable } from '@nestjs/common';
import { ExecutionQueueService } from './queue/execution-queue.service.js';
import {
  type CreateDraftRunParams,
  type CreatePublishedRunParams,
  WorkflowRunService,
} from './run/workflow-run.service.js';

/**
 * Two explicit entry points instead of one createRun({ source }): the caller states which kind
 * of run it wants. Both enqueue only the run id; the worker reads the canvas source from the row.
 */
@Injectable()
export class ExecutionService {
  constructor(
    private readonly runs: WorkflowRunService,
    private readonly queue: ExecutionQueueService,
  ) {}

  async createPublishedRun(params: CreatePublishedRunParams) {
    return this.enqueue(await this.runs.createPublished(params));
  }

  async createDraftRun(params: CreateDraftRunParams) {
    return this.enqueue(await this.runs.createDraft(params));
  }

  findWorkflowRuns(workflowId: string) {
    return this.runs.findByWorkflow(workflowId);
  }

  private async enqueue<T extends { id: string }>(run: T): Promise<T> {
    try {
      await this.queue.enqueueRun(run.id);
      return run;
    } catch (error) {
      await this.runs.markFailed(run.id, error);
      throw error;
    }
  }
}
