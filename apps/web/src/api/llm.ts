const API_BASE_URL = 'http://localhost:3000';

export interface LlmProviderInfo {
  id: string;
  baseUrl: string;
}

export async function getLlmProviders(): Promise<LlmProviderInfo[]> {
  const response = await fetch(`${API_BASE_URL}/llm/providers`);

  if (!response.ok) {
    throw new Error('Failed to fetch LLM providers');
  }

  return response.json() as Promise<LlmProviderInfo[]>;
}