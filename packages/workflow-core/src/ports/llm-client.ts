export interface LlmGenerateRequest {
  provider: string;
  model: string;
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
