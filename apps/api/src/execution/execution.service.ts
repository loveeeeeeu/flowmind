import { BadRequestException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { LlmProviderError } from '../llm/errors/llm-provider.error.js';
import { WorkflowEngine } from './engine/workflow-engine.js';
import type { WorkflowCanvas } from './engine/workflow-engine.types.js';
import { WorkflowExecutionError } from './engine/workflow-execution.error.js';
import { WorkflowValidationError } from './engine/workflow-validation.error.js';

@Injectable()
export class ExecutionService {
  constructor(private readonly engine: WorkflowEngine) {}

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

  async execute(canvas: WorkflowCanvas, input: Record<string, unknown>) {
    try {
      return await this.engine.execute(canvas, input);
    } catch (error) {
      this.rethrowAsHttpError(error);
    }
  }

  private rethrowAsHttpError(error: unknown): never {
    if (error instanceof WorkflowValidationError || error instanceof WorkflowExecutionError) {
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