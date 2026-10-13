export type RunStatus = 'PENDING' | 'RUNNING' | 'SUCCESS' | 'FAILED' | 'CANCELLED';

export type NodeRunStatus = 'PENDING' | 'RUNNING' | 'SUCCESS' | 'FAILED' | 'SKIPPED';

export interface WorkflowRunSummary {
  id: string;
  workflowId: string;
  /** null for legacy runs created before versioning. */
  workflowVersion: { id: string; version: number } | null;
  status: RunStatus;
  errorCode: string | null;
  errorMessage: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
}

export interface NodeRun {
  id: string;
  workflowRunId: string;
  nodeId: string;
  nodeType: string;
  status: NodeRunStatus;
  sequence: number;
  iteration: number | null;
  attempt: number;
  input: unknown;
  output: unknown;
  errorCode: string | null;
  errorMessage: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
}

export type ExecutionLogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

export interface ExecutionLog {
  id: string;
  workflowRunId: string;
  /** null for run-level events (started, completed, recovered). */
  nodeRunId: string | null;
  level: ExecutionLogLevel;
  message: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export interface WorkflowVersionSummary {
  id: string;
  version: number;
  createdAt: string;
}

export interface WorkflowRunDetail extends WorkflowRunSummary {
  workflowVersion: WorkflowVersionSummary | null;
  input: unknown;
  output: unknown;
  updatedAt: string;
  nodeRuns: NodeRun[];
}
