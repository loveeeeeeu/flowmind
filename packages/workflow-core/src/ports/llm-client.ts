/**
 * The workflow definition only knows which Model Center entry to use. Resolving modelId to a
 * provider, endpoint and secret is the runtime's job, so core never sees any of them.
 */
export interface LlmGenerateRequest {
  modelId: string;
  prompt: string;
  systemPrompt?: string;
  temperature?: number;
}

export interface LlmGenerateResponse {
  text: string;
  usage?: unknown;
}

export interface LlmClient {
  generate(request: LlmGenerateRequest): Promise<LlmGenerateResponse>;
}
