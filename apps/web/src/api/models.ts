import type { AvailableModel, CreateModelInput, Model, UpdateModelInput } from '../types/model';
import { request } from './client';

export function getCredentialModels(projectId: string, credentialId: string): Promise<Model[]> {
  return request<Model[]>(`/projects/${projectId}/credentials/${credentialId}/models`);
}

export function getAvailableModels(projectId: string): Promise<AvailableModel[]> {
  return request<AvailableModel[]>(`/projects/${projectId}/models/available`);
}

export function createModel(projectId: string, credentialId: string, input: CreateModelInput): Promise<Model> {
  return request<Model>(`/projects/${projectId}/credentials/${credentialId}/models`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
}

/** All or nothing; every modelName must be listed by the provider at import time. */
export function importModels(projectId: string, credentialId: string, models: CreateModelInput[]): Promise<Model[]> {
  return request<Model[]>(`/projects/${projectId}/credentials/${credentialId}/models/import`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ models }),
  });
}

export function updateModel(projectId: string, id: string, input: UpdateModelInput): Promise<Model> {
  return request<Model>(`/projects/${projectId}/models/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
}

/** Disable; models are never deleted. Re-enable with updateModel(id, { enabled: true }). */
export function disableModel(projectId: string, id: string): Promise<void> {
  return request<void>(`/projects/${projectId}/models/${id}`, { method: 'DELETE' });
}
