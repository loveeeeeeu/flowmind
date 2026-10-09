import type { ExecutionContext } from '../engine/execution-context.js';
import type { WorkflowNode } from '../engine/workflow-engine.types.js';
import type { NodeExecutor } from './node-executor.js';

export class StartExecutor implements NodeExecutor {
  readonly type = 'start';

  async execute(node: WorkflowNode, context: ExecutionContext) {
    return { output: { nodeId: node.id, input: context.getVariables() } };
  }
}