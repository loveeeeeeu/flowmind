import type { ExecutionContext } from '../execution-context.js';
import type { WorkflowNode } from '../workflow-engine.types.js';

export interface NodeExecutionResult {
  output?: unknown;
  nextHandle?: string;
}

export interface NodeExecutor {
  execute(node: WorkflowNode, context: ExecutionContext): Promise<NodeExecutionResult>;
}