export type RunStatus = 'PENDING' | 'RUNNING' | 'SUCCESS' | 'FAILED' | 'CANCELLED';

export type NodeRunStatus = 'PENDING' | 'RUNNING' | 'SUCCESS' | 'FAILED' | 'SKIPPED';

export interface WorkflowRunSummary {
  id: string;
  workflowId: string;
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

export interface WorkflowRunDetail extends WorkflowRunSummary {
  input: unknown;
  output: unknown;
  updatedAt: string;
  nodeRuns: NodeRun[];
}
