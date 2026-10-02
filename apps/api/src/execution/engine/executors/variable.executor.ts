import type { ExecutionContext } from '../execution-context.js';
import type { WorkflowNode } from '../workflow-engine.types.js';
import { WorkflowExecutionError } from '../workflow-execution.error.js';
import type { NodeExecutor } from './node-executor.js';
import { Injectable } from '@nestjs/common';

@Injectable()
export class VariableExecutor implements NodeExecutor {
  async execute(node: WorkflowNode, context: ExecutionContext) {
    const variableName = node.data.variableName;
    const value = node.data.value;

    if (typeof variableName !== 'string' || !variableName.trim()) {
      throw new WorkflowExecutionError(`Variable node ${node.id} has no variableName`);
    }

    context.setVariable(variableName, value);

    return {
      variableName,
      value,
    };
  }
}