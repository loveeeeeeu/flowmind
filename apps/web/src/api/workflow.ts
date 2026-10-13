import type {
  CreateWorkflowInput,
  PublishedWorkflowVersion,
  UpdateWorkflowInput,
  Workflow,
  WorkflowDetail,
  WorkflowListResponse,
} from '../types/workflow';
import type { WorkflowCanvas } from '../workflow/types/workflowCanvas';
import { request } from './client';

export function getWorkflows(
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

  return request<WorkflowListResponse>(`/workflows?${params.toString()}`);
}

export function getWorkflow(id: string): Promise<WorkflowDetail> {
  return request<WorkflowDetail>(`/workflows/${id}`);
}

export function createWorkflow(input: CreateWorkflowInput): Promise<Workflow> {
  return request<Workflow>('/workflows', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
}

export function updateWorkflow(
  id: string,
  input: UpdateWorkflowInput,
): Promise<Workflow> {
  return request<Workflow>(`/workflows/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
}

export function deleteWorkflow(id: string): Promise<Workflow> {
  return request<Workflow>(`/workflows/${id}`, {
    method: 'DELETE',
  });
}

export function updateWorkflowCanvas(id: string, canvas: WorkflowCanvas): Promise<Workflow> {
  return request<Workflow>(`/workflows/${id}/canvas`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(canvas),
  });
}

/** No body on purpose: the server publishes the draft it has saved, never an unsaved canvas. */
export function publishWorkflow(id: string): Promise<PublishedWorkflowVersion> {
  return request<PublishedWorkflowVersion>(`/workflows/${id}/publish`, {
    method: 'POST',
  });
}
