import type { WorkflowNode } from '../engine/workflow-engine.types.js';

export interface NodeExecutionEvent {
  node: WorkflowNode;
  sequence: number;
}

export interface NodeSuccessEvent extends NodeExecutionEvent {
  output: unknown;
}

export interface NodeFailureEvent extends NodeExecutionEvent {
  error: unknown;
}

export interface ExecutionObserver {
  onNodeStart?(event: NodeExecutionEvent): Promise<void> | void;
  onNodeSuccess?(event: NodeSuccessEvent): Promise<void> | void;
  onNodeFailure?(event: NodeFailureEvent): Promise<void> | void;
}
