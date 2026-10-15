/** A fully resolved call: the adapter only speaks the protocol, it never looks anything up. */
export interface LlmProviderRequest {
  baseUrl: string;
  apiKey: string;
  model: string;
  prompt: string;
  systemPrompt?: string;
  temperature?: number;
}

export interface LlmGenerateResult {
  text: string;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
  raw?: unknown;
}

export interface LlmProvider {
  generate(request: LlmProviderRequest): Promise<LlmGenerateResult>;
}
