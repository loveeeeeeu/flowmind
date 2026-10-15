import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LlmProviderError } from '../errors/llm-provider.error.js';
import { createHttpProviderError } from '../errors/map-provider-error.js';
import type { LlmGenerateResult, LlmProvider, LlmProviderRequest } from './llm-provider.js';

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

const DEFAULT_TIMEOUT_MS = 60_000;

/** "https://example.com/v1/" + "/chat/completions" must not become "...v1//chat/completions". */
export function normalizeBaseUrl(baseUrl: string) {
  return baseUrl.replace(/\/+$/, '');
}

/** The Chat Completions protocol spoken by OpenAI, DeepSeek and OpenAI-compatible servers. */
@Injectable()
export class OpenAICompatibleProvider implements LlmProvider {
  private readonly timeoutMs: number;

  constructor(configService: ConfigService) {
    this.timeoutMs = configService.get<number>('LLM_TIMEOUT_MS') ?? DEFAULT_TIMEOUT_MS;
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

    try {
      const response = await fetch(`${normalizeBaseUrl(request.baseUrl)}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${request.apiKey}`,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(this.timeoutMs),
      });

      if (!response.ok) {
        const bodyText = await response.text();
        throw createHttpProviderError(response.status, bodyText);
      }

      const data = (await response.json()) as ChatCompletionResponse;
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
    } catch (error) {
      if (error instanceof LlmProviderError) {
        throw error;
      }

      if (error instanceof DOMException && error.name === 'TimeoutError') {
        throw new LlmProviderError({
          code: 'TIMEOUT',
          retryable: true,
          message: `LLM provider timed out after ${this.timeoutMs}ms`,
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
