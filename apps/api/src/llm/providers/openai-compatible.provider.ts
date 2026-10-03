import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LlmProviderError } from '../errors/llm-provider.error.js';
import { createHttpProviderError } from '../errors/map-provider-error.js';
import type {
  LlmGenerateInput,
  LlmGenerateResult,
  LlmProvider,
  LlmProviderConfig,
} from './llm-provider.js';

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

@Injectable()
export class OpenAICompatibleProvider implements LlmProvider {
  constructor(private readonly configService: ConfigService) {}

  async generate(provider: LlmProviderConfig, input: LlmGenerateInput): Promise<LlmGenerateResult> {
    const timeoutMs = this.configService.get<number>('LLM_TIMEOUT_MS') ?? DEFAULT_TIMEOUT_MS;

    const messages: Array<{ role: 'system' | 'user'; content: string }> = [];

    if (input.systemPrompt?.trim()) {
      messages.push({ role: 'system', content: input.systemPrompt });
    }

    messages.push({ role: 'user', content: input.prompt });

    const body: Record<string, unknown> = {
      model: input.model,
      messages,
    };

    if (input.temperature !== undefined) {
      body.temperature = input.temperature;
    }

    try {
      const response = await fetch(`${provider.baseUrl.replace(/\/$/, '')}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${provider.apiKey}`,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });

      if (!response.ok) {
        const bodyText = await response.text();
        throw createHttpProviderError(provider.id, response.status, bodyText);
      }

      const data = (await response.json()) as ChatCompletionResponse;
      const text = data.choices?.[0]?.message?.content;

      if (!text) {
        throw new LlmProviderError({
          providerId: provider.id,
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
          providerId: provider.id,
          code: 'TIMEOUT',
          retryable: true,
          message: `LLM provider timed out after ${timeoutMs}ms`,
          cause: error,
        });
      }

      throw new LlmProviderError({
        providerId: provider.id,
        code: 'NETWORK_ERROR',
        retryable: true,
        message: `Failed to connect to LLM provider "${provider.id}"`,
        cause: error,
      });
    }
  }
}