/** Where and as whom to call. apiKey is a decrypted secret: keep it in memory only. */
export interface ProviderConnection {
  baseUrl: string;
  apiKey: string;
}

/** A fully resolved call: the adapter only speaks the protocol, it never looks anything up. */
export interface LlmProviderRequest extends ProviderConnection {
  model: string;
  /** Legacy single-turn fields, kept so ordinary LLM nodes stay simple. */
  prompt?: string;
  systemPrompt?: string;
  /** Conversation form used by Agent nodes. */
  messages?: ChatMessage[];
  tools?: ChatToolDefinition[];
  temperature?: number;
}

export interface ChatToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface ChatToolCall {
  id: string;
  name: string;
  arguments: unknown;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content?: string;
  toolCallId?: string;
  toolCalls?: ChatToolCall[];
}

export interface LlmGenerateResult {
  text: string | null;
  toolCalls: ChatToolCall[];
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
  raw?: unknown;
}

/** A batch request because embedding providers are most efficient when called with many texts. */
export interface EmbeddingProviderRequest extends ProviderConnection {
  model: string;
  texts: string[];
}

export interface EmbeddingResult {
  embeddings: number[][];
  dimensions: number;
  usage?: {
    promptTokens?: number;
    totalTokens?: number;
  };
  raw?: unknown;
}

/** Only the id is reliable across OpenAI-compatible servers; capabilities are not reported. */
export interface RemoteModelInfo {
  id: string;
}

export interface LlmProvider {
  generate(request: LlmProviderRequest): Promise<LlmGenerateResult>;
  listModels(connection: ProviderConnection): Promise<RemoteModelInfo[]>;
  /** Resolves when the provider accepts the credential; never costs tokens. */
  testConnection(connection: ProviderConnection): Promise<void>;
}

/** Kept separate from chat: a provider may support one capability but not the other. */
export interface EmbeddingProvider {
  embed(request: EmbeddingProviderRequest): Promise<EmbeddingResult>;
}

export type ModelProvider = LlmProvider & Partial<EmbeddingProvider>;
