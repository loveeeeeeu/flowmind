export type RunStatus = 'PENDING' | 'RUNNING' | 'SUCCESS' | 'FAILED' | 'CANCELLED';

export type NodeRunStatus = 'PENDING' | 'RUNNING' | 'SUCCESS' | 'FAILED' | 'SKIPPED';

/** DRAFT: "测试草稿" run of an editor snapshot. PUBLISHED: run of a published version. */
export type WorkflowRunSource = 'DRAFT' | 'PUBLISHED';

export interface RunApiKeySummary {
  id: string;
  name: string;
  prefix: string;
}

export interface WorkflowRunSummary {
  id: string;
  workflowId: string;
  source: WorkflowRunSource;
  /** null for draft test runs, and for legacy runs created before versioning. */
  workflowVersion: { id: string; version: number } | null;
  /** The API key that triggered the run through /api/v1; null for editor runs. */
  workflowApiKey: RunApiKeySummary | null;
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

export interface RunVersionSummary {
  id: string;
  version: number;
  createdAt: string;
}

export interface WorkflowRunDetail extends WorkflowRunSummary {
  workflowVersion: RunVersionSummary | null;
  input: unknown;
  output: unknown;
  updatedAt: string;
  nodeRuns: NodeRun[];
}
