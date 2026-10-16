import type {
  CreateWorkflowInput,
  UpdateWorkflowInput,
  Workflow,
  WorkflowDetail,
  WorkflowListResponse,
  WorkflowVersionDetail,
  WorkflowVersionSummary,
} from '../types/workflow';
import type { WorkflowCanvas } from '../workflow/types/workflowCanvas';
import { request } from './client';

export function getWorkflows(
  projectId: string,
  page = 1,
  pageSize = 10,
  keyword = '',
): Promise<WorkflowListResponse> {
  const params = new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize),
  });

  if (keyword) {
    params.set('keyword', keyword);
  }

  return request<WorkflowListResponse>(`/projects/${projectId}/workflows?${params.toString()}`);
}

export function getWorkflow(projectId: string, id: string): Promise<WorkflowDetail> {
  return request<WorkflowDetail>(`/projects/${projectId}/workflows/${id}`);
}

export function createWorkflow(projectId: string, input: CreateWorkflowInput): Promise<Workflow> {
  return request<Workflow>(`/projects/${projectId}/workflows`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
}

export function updateWorkflow(projectId: string, id: string,
  input: UpdateWorkflowInput,
): Promise<Workflow> {
  return request<Workflow>(`/projects/${projectId}/workflows/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
}

export function deleteWorkflow(projectId: string, id: string): Promise<Workflow> {
  return request<Workflow>(`/projects/${projectId}/workflows/${id}`, {
    method: 'DELETE',
  });
}

export function updateWorkflowCanvas(projectId: string, id: string, canvas: WorkflowCanvas): Promise<Workflow> {
  return request<Workflow>(`/projects/${projectId}/workflows/${id}/canvas`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(canvas),
  });
}

/** No body on purpose: the server publishes the draft it has saved, never an unsaved canvas. */
export function publishWorkflow(projectId: string, id: string): Promise<WorkflowVersionSummary> {
  return request<WorkflowVersionSummary>(`/projects/${projectId}/workflows/${id}/publish`, {
    method: 'POST',
  });
}

export function getWorkflowVersions(projectId: string, workflowId: string): Promise<WorkflowVersionSummary[]> {
  return request<WorkflowVersionSummary[]>(`/projects/${projectId}/workflows/${workflowId}/versions`);
}

export function getWorkflowVersion(projectId: string, workflowId: string,
  versionId: string,
): Promise<WorkflowVersionDetail> {
  return request<WorkflowVersionDetail>(`/projects/${projectId}/workflows/${workflowId}/versions/${versionId}`);
}
