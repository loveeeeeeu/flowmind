/** Where and as whom to call. apiKey is a decrypted secret: keep it in memory only. */
export interface ProviderConnection {
  baseUrl: string;
  apiKey: string;
}

/** A fully resolved call: the adapter only speaks the protocol, it never looks anything up. */
export interface LlmProviderRequest extends ProviderConnection {
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
