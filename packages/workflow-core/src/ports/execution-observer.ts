import type { WorkflowNode } from '../engine/workflow-engine.types.js';

export interface NodeExecutionEvent {
  node: WorkflowNode;
  /** Logical execution step; retries of the same step share it. */
  sequence: number;
  /** 1-based try counter within the step. */
  attempt: number;
}

export interface NodeSuccessEvent extends NodeExecutionEvent {
  output: unknown;
}

export interface NodeFailureEvent extends NodeExecutionEvent {
  error: unknown;
  willRetry: boolean;
  /** Backoff before the next attempt; only set when willRetry is true. */
  retryDelayMs?: number;
}

export interface ExecutionObserver {
  onNodeStart?(event: NodeExecutionEvent): Promise<void> | void;
  onNodeSuccess?(event: NodeSuccessEvent): Promise<void> | void;
  onNodeFailure?(event: NodeFailureEvent): Promise<void> | void;
}
