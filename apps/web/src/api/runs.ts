import type { WorkflowRunDetail, WorkflowRunSummary } from '../types/run';
import { request } from './client';

export function createWorkflowRun(
  workflowId: string,
  input: Record<string, unknown>,
): Promise<WorkflowRunSummary> {
  return request<WorkflowRunSummary>(`/workflows/${workflowId}/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ input }),
  });
}

export function getWorkflowRun(runId: string): Promise<WorkflowRunDetail> {
  return request<WorkflowRunDetail>(`/runs/${runId}`);
}

export function getWorkflowRuns(workflowId: string): Promise<WorkflowRunSummary[]> {
  return request<WorkflowRunSummary[]>(`/workflows/${workflowId}/runs`);
}
