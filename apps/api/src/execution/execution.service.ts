import { BadRequestException, Injectable } from '@nestjs/common';
import { WorkflowEngine } from './engine/workflow-engine.js';
import type { WorkflowCanvas } from './engine/workflow-engine.types.js';
import { WorkflowValidationError } from './engine/workflow-validation.error.js';

@Injectable()
export class ExecutionService {
  private readonly engine = new WorkflowEngine();

  createExecutionPlan(canvas: WorkflowCanvas) {
    try {
      const nodes = this.engine.buildExecutionPlan(canvas);

      return {
        valid: true,
        order: nodes.map((node) => node.id),
      };
    } catch (error) {
      if (error instanceof WorkflowValidationError) {
        throw new BadRequestException(error.message);
      }

      throw error;
    }
  }
}