import { LlmProviderError } from './llm-provider.error.js';
import type {
  EmbeddingProvider,
  EmbeddingProviderRequest,
  EmbeddingResult,
  ChatMessage,
  ChatToolDefinition,
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
      tool_calls?: Array<{
        id?: string;
        type?: string;
        function?: { name?: string; arguments?: string };
      }>;
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
interface EmbeddingResponse {
  data?: Array<{ index?: number; embedding?: unknown }>;
  usage?: { prompt_tokens?: number; total_tokens?: number };
}

export class OpenAICompatibleProvider implements LlmProvider, EmbeddingProvider {
  private readonly generateTimeoutMs: number;
  private readonly connectionTimeoutMs: number;

  constructor(options: OpenAICompatibleProviderOptions = {}) {
    this.generateTimeoutMs = options.generateTimeoutMs ?? DEFAULT_GENERATE_TIMEOUT_MS;
    this.connectionTimeoutMs = options.connectionTimeoutMs ?? DEFAULT_CONNECTION_TIMEOUT_MS;
  }

  async generate(request: LlmProviderRequest): Promise<LlmGenerateResult> {
    const messages = request.messages ? request.messages.map(toProviderMessage) : legacyMessages(request);

    const body: Record<string, unknown> = {
      model: request.model,
      messages,
    };

    if (request.temperature !== undefined) {
      body.temperature = request.temperature;
    }
    if (request.tools?.length) {
      body.tools = request.tools.map(toProviderTool);
    }

    const data = (await this.send(request, '/chat/completions', this.generateTimeoutMs, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })) as ChatCompletionResponse;
    const message = data.choices?.[0]?.message;
    if (!message) {
      throw new LlmProviderError({
        code: 'EMPTY_RESPONSE',
        retryable: false,
        message: 'LLM provider returned no assistant message',
      });
    }
    const toolCalls = parseToolCalls(message.tool_calls);
    const text = typeof message.content === 'string' && message.content.trim() ? message.content : null;
    if (!text && toolCalls.length === 0) {
      throw new LlmProviderError({ code: 'EMPTY_RESPONSE', retryable: false, message: 'LLM provider returned no text or tool call' });
    }

    return {
      text,
      toolCalls,
      usage: {
        promptTokens: data.usage?.prompt_tokens,
        completionTokens: data.usage?.completion_tokens,
        totalTokens: data.usage?.total_tokens,
      },
      raw: data,
    };
  }

  async embed(request: EmbeddingProviderRequest): Promise<EmbeddingResult> {
    const data = (await this.send(request, '/embeddings', this.generateTimeoutMs, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: request.model, input: request.texts }),
    })) as EmbeddingResponse;

    if (!Array.isArray(data.data) || data.data.length !== request.texts.length) {
      throw new LlmProviderError({
        code: 'INVALID_PROVIDER_RESPONSE',
        retryable: false,
        message: 'Embedding provider returned an invalid number of vectors',
      });
    }

    const ordered = [...data.data].sort((a, b) => (a.index ?? -1) - (b.index ?? -1));
    const embeddings = ordered.map((item, expectedIndex) => {
      if (item.index !== expectedIndex || !Array.isArray(item.embedding) || item.embedding.length === 0 ||
        !item.embedding.every((value) => typeof value === 'number' && Number.isFinite(value))) {
        throw new LlmProviderError({
          code: 'INVALID_PROVIDER_RESPONSE',
          retryable: false,
          message: 'Embedding provider returned an invalid vector',
        });
      }
      return item.embedding;
    });
    const dimensions = embeddings[0].length;
    if (embeddings.some((embedding) => embedding.length !== dimensions)) {
      throw new LlmProviderError({
        code: 'INVALID_PROVIDER_RESPONSE',
        retryable: false,
        message: 'Embedding provider returned vectors with inconsistent dimensions',
      });
    }

    return {
      embeddings,
      dimensions,
      usage: { promptTokens: data.usage?.prompt_tokens, totalTokens: data.usage?.total_tokens },
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

function legacyMessages(request: LlmProviderRequest) {
  if (typeof request.prompt !== 'string') {
    throw new LlmProviderError({ code: 'INVALID_REQUEST', retryable: false, message: 'LLM request requires prompt or messages' });
  }
  const messages: Array<{ role: 'system' | 'user'; content: string }> = [];
  if (request.systemPrompt?.trim()) messages.push({ role: 'system', content: request.systemPrompt });
  messages.push({ role: 'user', content: request.prompt });
  return messages;
}

function toProviderTool(tool: ChatToolDefinition) {
  return { type: 'function', function: { name: tool.name, description: tool.description, parameters: tool.inputSchema } };
}

function toProviderMessage(message: ChatMessage) {
  if (message.role === 'tool') {
    return { role: 'tool', tool_call_id: message.toolCallId, content: message.content ?? '' };
  }
  return {
    role: message.role,
    content: message.content ?? '',
    ...(message.toolCalls?.length ? { tool_calls: message.toolCalls.map((call) => ({ id: call.id, type: 'function', function: { name: call.name, arguments: JSON.stringify(call.arguments) } })) } : {}),
  };
}

function parseToolCalls(raw: Array<{ id?: string; type?: string; function?: { name?: string; arguments?: string } }> | undefined): import('./llm-provider.js').ChatToolCall[] {
  if (!raw) return [];
  return raw.map((call) => {
    if (!call.id || call.type !== 'function' || !call.function?.name || typeof call.function.arguments !== 'string') {
      throw new LlmProviderError({ code: 'INVALID_PROVIDER_RESPONSE', retryable: false, message: 'LLM provider returned an invalid tool call' });
    }
    try {
      return { id: call.id, name: call.function.name, arguments: JSON.parse(call.function.arguments) };
    } catch (cause) {
      throw new LlmProviderError({ code: 'INVALID_TOOL_CALL_ARGUMENTS', retryable: false, message: 'Model returned invalid tool arguments', cause });
    }
  });
}
