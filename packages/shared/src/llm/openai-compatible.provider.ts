import { LlmProviderError } from './llm-provider.error.js';
import type {
  LlmGenerateResult,
  LlmProvider,
  LlmProviderRequest,
  ProviderConnection,
  RemoteModelInfo,
} from './llm-provider.js';
import { createHttpProviderError } from './map-provider-error.js';
import { normalizeBaseUrl } from './provider-config.js';

interface ChatCompletionResponse {
  choices?: Array<{
    message?: {
      content?: string | null;
    };
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
}

export interface OpenAICompatibleProviderOptions {
  /** Chat completions; models can take long to answer. */
  generateTimeoutMs?: number;
  /** Listing models / testing a connection: a healthy provider answers fast. */
  connectionTimeoutMs?: number;
}

const DEFAULT_GENERATE_TIMEOUT_MS = 60_000;
const DEFAULT_CONNECTION_TIMEOUT_MS = 10_000;

function invalidModelList() {
  return new LlmProviderError({
    code: 'INVALID_PROVIDER_RESPONSE',
    retryable: false,
    message: 'LLM provider returned an invalid model list (expected { "data": [{ "id": ... }] })',
  });
}

/** The OpenAI protocol spoken by OpenAI, DeepSeek and OpenAI-compatible servers. */
export class OpenAICompatibleProvider implements LlmProvider {
  private readonly generateTimeoutMs: number;
  private readonly connectionTimeoutMs: number;

  constructor(options: OpenAICompatibleProviderOptions = {}) {
    this.generateTimeoutMs = options.generateTimeoutMs ?? DEFAULT_GENERATE_TIMEOUT_MS;
    this.connectionTimeoutMs = options.connectionTimeoutMs ?? DEFAULT_CONNECTION_TIMEOUT_MS;
  }

  async generate(request: LlmProviderRequest): Promise<LlmGenerateResult> {
    const messages: Array<{ role: 'system' | 'user'; content: string }> = [];

    if (request.systemPrompt?.trim()) {
      messages.push({ role: 'system', content: request.systemPrompt });
    }

    messages.push({ role: 'user', content: request.prompt });

    const body: Record<string, unknown> = {
      model: request.model,
      messages,
    };

    if (request.temperature !== undefined) {
      body.temperature = request.temperature;
    }

    const data = (await this.send(request, '/chat/completions', this.generateTimeoutMs, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })) as ChatCompletionResponse;
    const text = data.choices?.[0]?.message?.content;

    if (!text) {
      throw new LlmProviderError({
        code: 'EMPTY_RESPONSE',
        retryable: false,
        message: 'LLM provider returned no text',
      });
    }

    return {
      text,
      usage: {
        promptTokens: data.usage?.prompt_tokens,
        completionTokens: data.usage?.completion_tokens,
        totalTokens: data.usage?.total_tokens,
      },
      raw: data,
    };
  }

  /** GET /models. Entries without a string id are skipped; anything else not shaped like a list fails. */
  async listModels(connection: ProviderConnection): Promise<RemoteModelInfo[]> {
    const body = await this.send(connection, '/models', this.connectionTimeoutMs, { method: 'GET' });
    const data = (body as { data?: unknown } | null)?.data;

    if (!Array.isArray(data)) {
      throw invalidModelList();
    }

    const ids = data
      .map((item: unknown) => (item as { id?: unknown } | null)?.id)
      .filter((id): id is string => typeof id === 'string' && id.trim() !== '');

    return [...new Set(ids)].sort().map((id) => ({ id }));
  }

  /** Listing models proves the URL, the key and the protocol without spending tokens. */
  async testConnection(connection: ProviderConnection): Promise<void> {
    await this.listModels(connection);
  }

  private async send(
    connection: ProviderConnection,
    path: string,
    timeoutMs: number,
    init: RequestInit,
  ): Promise<unknown> {
    let response: Response;

    try {
      response = await fetch(`${normalizeBaseUrl(connection.baseUrl)}${path}`, {
        ...init,
        headers: { ...init.headers, Authorization: `Bearer ${connection.apiKey}` },
        signal: AbortSignal.timeout(timeoutMs),
      });

      if (!response.ok) {
        // Some servers echo request details back; the key must not reach a message or a log.
        const bodyText = await response.text();
        throw createHttpProviderError(
          response.status,
          connection.apiKey ? bodyText.replaceAll(connection.apiKey, '[redacted]') : bodyText,
        );
      }

      return await response.json();
    } catch (error) {
      if (error instanceof LlmProviderError) {
        throw error;
      }

      if (error instanceof DOMException && error.name === 'TimeoutError') {
        throw new LlmProviderError({
          code: 'TIMEOUT',
          retryable: true,
          message: `LLM provider timed out after ${timeoutMs}ms`,
          cause: error,
        });
      }

      if (error instanceof SyntaxError) {
        throw new LlmProviderError({
          code: 'INVALID_PROVIDER_RESPONSE',
          retryable: false,
          message: 'LLM provider returned a response that is not JSON',
          cause: error,
        });
      }

      throw new LlmProviderError({
        code: 'NETWORK_ERROR',
        retryable: true,
        message: 'Failed to connect to LLM provider',
        cause: error,
      });
    }
  }
}
