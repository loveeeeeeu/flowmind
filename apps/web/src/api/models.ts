import type { AvailableModel, CreateModelInput, Model, UpdateModelInput } from '../types/model';
import { request } from './client';

export function getCredentialModels(credentialId: string): Promise<Model[]> {
  return request<Model[]>(`/credentials/${credentialId}/models`);
}

export function getAvailableModels(): Promise<AvailableModel[]> {
  return request<AvailableModel[]>('/models/available');
}

export function createModel(credentialId: string, input: CreateModelInput): Promise<Model> {
  return request<Model>(`/credentials/${credentialId}/models`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
}

/** All or nothing; every modelName must be listed by the provider at import time. */
export function importModels(credentialId: string, models: CreateModelInput[]): Promise<Model[]> {
  return request<Model[]>(`/credentials/${credentialId}/models/import`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ models }),
  });
}

export function updateModel(id: string, input: UpdateModelInput): Promise<Model> {
  return request<Model>(`/models/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
}

/** Disable; models are never deleted. Re-enable with updateModel(id, { enabled: true }). */
export function disableModel(id: string): Promise<void> {
  return request<void>(`/models/${id}`, { method: 'DELETE' });
}
