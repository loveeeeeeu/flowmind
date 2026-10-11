import { request } from './client';

export interface LlmProviderInfo {
  id: string;
  baseUrl: string;
}

export function getLlmProviders(): Promise<LlmProviderInfo[]> {
  return request<LlmProviderInfo[]>('/llm/providers');
}
