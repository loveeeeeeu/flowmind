import type { ExecutionContext } from '../execution-context.js';
import type { WorkflowNode } from '../workflow-engine.types.js';

export interface NodeExecutor {
  execute(node: WorkflowNode, context: ExecutionContext): Promise<unknown>;
}