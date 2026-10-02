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
  
  export interface LlmProvider {
    generate(input: LlmGenerateInput): Promise<LlmGenerateResult>;
  }