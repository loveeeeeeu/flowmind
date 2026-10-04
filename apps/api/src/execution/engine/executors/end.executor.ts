import type { ExecutionContext } from '../execution-context.js';
import type { WorkflowNode } from '../workflow-engine.types.js';
import { WorkflowExecutionError } from '../workflow-execution.error.js';
import type { NodeExecutor } from './node-executor.js';
import { Injectable } from '@nestjs/common';

@Injectable()
export class EndExecutor implements NodeExecutor {
  async execute(node: WorkflowNode, context: ExecutionContext) {
    const outputVariable = node.data.outputVariable;

    if (typeof outputVariable !== 'string' || !outputVariable.trim()) {
      throw new WorkflowExecutionError(`End node ${node.id} has no outputVariable`);
    }

    const value = context.getVariable(outputVariable);

    if (value === undefined) {
      throw new WorkflowExecutionError(`Output variable "${outputVariable}" not found`);
    }

    return { output: { result: value } };
  }
}