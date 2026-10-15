import type {
  CreateCredentialInput,
  Credential,
  RemoteModel,
  UpdateCredentialInput,
} from '../types/credential';
import { request } from './client';

export function getCredentials(): Promise<Credential[]> {
  return request<Credential[]>('/credentials');
}

export function createCredential(input: CreateCredentialInput): Promise<Credential> {
  return request<Credential>('/credentials', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
}

export function updateCredential(id: string, input: UpdateCredentialInput): Promise<Credential> {
  return request<Credential>(`/credentials/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
}

export function revokeCredential(id: string): Promise<void> {
  return request<void>(`/credentials/${id}`, { method: 'DELETE' });
}

/** Lists the provider's models with the stored key; throws ApiRequestError with the failure code. */
export function testCredential(id: string): Promise<{ ok: true }> {
  return request<{ ok: true }>(`/credentials/${id}/test`, { method: 'POST' });
}

/** Calls the provider every time: only on an explicit user action, never on page load. */
export function getRemoteModels(id: string): Promise<RemoteModel[]> {
  return request<RemoteModel[]>(`/credentials/${id}/remote-models`);
}
