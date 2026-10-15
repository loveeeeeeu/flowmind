import type { CreateCredentialInput, Credential, UpdateCredentialInput } from '../types/credential';
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
