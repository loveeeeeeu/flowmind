export interface LlmGenerateInput {
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

export interface LlmProviderConfig {
  id: string;
  baseUrl: string;
  apiKey: string;
}

export interface LlmProvider {
  generate(config: LlmProviderConfig, input: LlmGenerateInput): Promise<LlmGenerateResult>;
}