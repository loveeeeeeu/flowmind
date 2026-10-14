import type { CreatedWorkflowApiKey, WorkflowApiKey } from '../types/apiKey';
import { request } from './client';

export function getWorkflowApiKeys(workflowId: string): Promise<WorkflowApiKey[]> {
  return request<WorkflowApiKey[]>(`/workflows/${workflowId}/api-keys`);
}

export function createWorkflowApiKey(
  workflowId: string,
  name: string,
): Promise<CreatedWorkflowApiKey> {
  return request<CreatedWorkflowApiKey>(`/workflows/${workflowId}/api-keys`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
}

export function revokeWorkflowApiKey(workflowId: string, keyId: string): Promise<void> {
  return request<void>(`/workflows/${workflowId}/api-keys/${keyId}`, {
    method: 'DELETE',
  });
}
