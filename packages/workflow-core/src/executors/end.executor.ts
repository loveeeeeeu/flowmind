import type { ExecutionContext } from '../engine/execution-context.js';
import type { WorkflowNode } from '../engine/workflow-engine.types.js';
import { WorkflowExecutionError } from '../engine/workflow-execution.error.js';
import type { NodeExecutor } from './node-executor.js';

export class EndExecutor implements NodeExecutor {
  readonly type = 'end';

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