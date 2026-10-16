import type { ExecutionLog, WorkflowRunDetail, WorkflowRunSummary } from '../types/run';
import type { WorkflowCanvas } from '../workflow/types/workflowCanvas';
import { request } from './client';

export function createWorkflowRun(
  projectId: string,
  workflowId: string,
  input: Record<string, unknown>,
): Promise<WorkflowRunSummary> {
  return request<WorkflowRunSummary>(`/projects/${projectId}/workflows/${workflowId}/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ input }),
  });
}

/** Tests the editor's current canvas (saved or not); creates a DRAFT run, never a version. */
export function createWorkflowTestRun(
  projectId: string,
  workflowId: string,
  input: Record<string, unknown>,
  canvas: WorkflowCanvas,
): Promise<WorkflowRunSummary> {
  return request<WorkflowRunSummary>(`/projects/${projectId}/workflows/${workflowId}/test-run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ input, canvas }),
  });
}

export function getWorkflowRun(runId: string): Promise<WorkflowRunDetail> {
  return request<WorkflowRunDetail>(`/runs/${runId}`);
}

export function getWorkflowRunLogs(runId: string): Promise<ExecutionLog[]> {
  return request<ExecutionLog[]>(`/runs/${runId}/logs`);
}

export function getWorkflowRuns(projectId: string, workflowId: string): Promise<WorkflowRunSummary[]> {
  return request<WorkflowRunSummary[]>(`/projects/${projectId}/workflows/${workflowId}/runs`);
}
