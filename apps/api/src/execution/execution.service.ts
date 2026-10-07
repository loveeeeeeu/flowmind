import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { LlmProviderError } from '../llm/errors/llm-provider.error.js';
import { WorkflowEngine } from './engine/workflow-engine.js';
import type { WorkflowCanvas } from './engine/workflow-engine.types.js';
import { WorkflowExecutionError } from './engine/workflow-execution.error.js';
import { WorkflowValidationError } from './engine/workflow-validation.error.js';
import { WorkflowRunService } from './run/workflow-run.service.js';

export interface ExecuteWorkflowParams {
  workflowId: string;
  canvas: WorkflowCanvas;
  input: Record<string, unknown>;
}

@Injectable()
export class ExecutionService {
  constructor(
    private readonly engine: WorkflowEngine,
    private readonly runs: WorkflowRunService,
  ) {}

  createExecutionPlan(canvas: WorkflowCanvas) {
    try {
      const nodes = this.engine.buildExecutionPlan(canvas);

      return {
        valid: true,
        order: nodes.map((node) => node.id),
      };
    } catch (error) {
      this.rethrowAsHttpError(error);
    }
  }

  async execute(params: ExecuteWorkflowParams) {
    const run = await this.runs.create(params.workflowId, params.input);
    await this.runs.markRunning(run.id);

    try {
      const result = await this.engine.execute(params.canvas, params.input, {
        workflowRunId: run.id,
      });

      await this.runs.markSuccess(run.id, result);

      return {
        runId: run.id,
        ...result,
      };
    } catch (error) {
      await this.runs.markFailed(run.id, error);
      this.rethrowAsHttpError(error);
    }
  }

  findWorkflowRuns(workflowId: string) {
    return this.runs.findByWorkflow(workflowId);
  }

  private rethrowAsHttpError(error: unknown): never {
    if (
      error instanceof WorkflowValidationError ||
      error instanceof WorkflowExecutionError
    ) {
      throw new BadRequestException(error.message);
    }

    if (error instanceof LlmProviderError) {
      throw new ServiceUnavailableException({
        statusCode: 503,
        message: error.message,
        code: error.code,
        provider: error.providerId,
        retryable: error.retryable,
      });
    }

    throw error;
  }
}
