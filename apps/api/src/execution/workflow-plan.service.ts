import { Injectable } from '@nestjs/common';
import {
  createWorkflowValidator,
  type WorkflowCanvas,
  WorkflowGraph,
  WorkflowValidationError,
} from '@flowmind/workflow-core';
import { apiError } from '../common/api-error.js';

@Injectable()
export class WorkflowPlanService {
  private readonly validator = createWorkflowValidator();

  createExecutionPlan(canvas: WorkflowCanvas) {
    try {
      const { executionPlan } = this.validator.validate(new WorkflowGraph(canvas));

      return {
        valid: true,
        order: executionPlan.map((node) => node.id),
      };
    } catch (error) {
      if (error instanceof WorkflowValidationError) {
        throw apiError.badRequest('WORKFLOW_INVALID', error.message);
      }

      throw error;
    }
  }
}
