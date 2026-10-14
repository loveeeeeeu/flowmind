/**
 * Public response contracts of External API v1. Built field by field from the database rows so
 * new internal columns (heartbeatAt, draftSnapshot, nodeRuns...) never appear here by accident.
 */

export type ExternalRunStatus = 'PENDING' | 'RUNNING' | 'SUCCESS' | 'FAILED' | 'CANCELLED';

export interface ExternalRunAcceptedResponse {
  runId: string;
  workflowId: string;
  /** The published workflow version this run is bound to; unrelated to the /v1 in the URL. */
  version: number;
  status: 'PENDING';
}

export interface ExternalRunError {
  code: string;
  message: string;
}

export interface ExternalRunResponse {
  runId: string;
  workflowId: string;
  /** null only for runs created before workflow versions existed. */
  version: number | null;
  status: ExternalRunStatus;
  /** Set only when status is SUCCESS. */
  output: unknown;
  /** Set only when status is FAILED. */
  error: ExternalRunError | null;
  createdAt: Date;
  startedAt: Date | null;
  finishedAt: Date | null;
}
