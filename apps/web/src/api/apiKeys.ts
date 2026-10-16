import type { CreatedWorkflowApiKey, WorkflowApiKey } from '../types/apiKey';
import { request } from './client';

export function getWorkflowApiKeys(projectId: string, workflowId: string): Promise<WorkflowApiKey[]> {
  return request<WorkflowApiKey[]>(`/projects/${projectId}/workflows/${workflowId}/api-keys`);
}

export function createWorkflowApiKey(
  projectId: string, workflowId: string,
  name: string,
): Promise<CreatedWorkflowApiKey> {
  return request<CreatedWorkflowApiKey>(`/projects/${projectId}/workflows/${workflowId}/api-keys`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
}

export function revokeWorkflowApiKey(projectId: string, workflowId: string, keyId: string): Promise<void> {
  return request<void>(`/projects/${projectId}/workflows/${workflowId}/api-keys/${keyId}`, {
    method: 'DELETE',
  });
}
