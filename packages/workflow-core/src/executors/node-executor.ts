import type { ExecutionContext } from '../engine/execution-context.js';
import type { WorkflowNode } from '../engine/workflow-engine.types.js';

export interface NodeExecutionResult {
  output?: unknown;
  nextHandle?: string;
}

/**
 * 'transient': the scheduler may re-execute the node when the error is retryable.
 * 'none': never re-executed, e.g. non-idempotent side effects or runtime state mutation.
 */
export type NodeRetryMode = 'none' | 'transient';

/**
 * Executors must only write to the ExecutionContext after their work succeeded,
 * otherwise a retried attempt would run on top of a half-written context.
 */
export interface NodeExecutor {
  readonly type: string;
  /** Defaults to 'none' when not implemented. */
  getRetryMode?(node: WorkflowNode): NodeRetryMode;
  execute(node: WorkflowNode, context: ExecutionContext): Promise<NodeExecutionResult>;
}
