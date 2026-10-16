import type {
  CreateCredentialInput,
  Credential,
  RemoteModel,
  UpdateCredentialInput,
} from '../types/credential';
import { request } from './client';

export function getCredentials(projectId: string): Promise<Credential[]> {
  return request<Credential[]>(`/projects/${projectId}/credentials`);
}

export function createCredential(projectId: string, input: CreateCredentialInput): Promise<Credential> {
  return request<Credential>(`/projects/${projectId}/credentials`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
}

export function updateCredential(projectId: string, id: string, input: UpdateCredentialInput): Promise<Credential> {
  return request<Credential>(`/projects/${projectId}/credentials/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
}

export function revokeCredential(projectId: string, id: string): Promise<void> {
  return request<void>(`/projects/${projectId}/credentials/${id}`, { method: 'DELETE' });
}

/** Lists the provider's models with the stored key; throws ApiRequestError with the failure code. */
export function testCredential(projectId: string, id: string): Promise<{ ok: true }> {
  return request<{ ok: true }>(`/projects/${projectId}/credentials/${id}/test`, { method: 'POST' });
}

/** Calls the provider every time: only on an explicit user action, never on page load. */
export function getRemoteModels(projectId: string, id: string): Promise<RemoteModel[]> {
  return request<RemoteModel[]>(`/projects/${projectId}/credentials/${id}/remote-models`);
}
