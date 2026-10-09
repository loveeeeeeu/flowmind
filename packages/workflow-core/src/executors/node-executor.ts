import type { ExecutionContext } from '../engine/execution-context.js';
import type { WorkflowNode } from '../engine/workflow-engine.types.js';

export interface NodeExecutionResult {
  output?: unknown;
  nextHandle?: string;
}

export interface NodeExecutor {
  readonly type: string;
  execute(node: WorkflowNode, context: ExecutionContext): Promise<NodeExecutionResult>;
}