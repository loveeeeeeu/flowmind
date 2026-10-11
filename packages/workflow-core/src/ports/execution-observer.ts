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
}

export interface ExecutionObserver {
  onNodeStart?(event: NodeExecutionEvent): Promise<void> | void;
  onNodeSuccess?(event: NodeSuccessEvent): Promise<void> | void;
  onNodeFailure?(event: NodeFailureEvent): Promise<void> | void;
}
