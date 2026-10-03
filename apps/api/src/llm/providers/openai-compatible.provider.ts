import { Injectable } from '@nestjs/common';
import { LlmProviderError } from '../llm-provider.error.js';
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

const REQUEST_TIMEOUT_MS = 60_000;

@Injectable()
export class OpenAICompatibleProvider implements LlmProvider {
  async generate(config: LlmProviderConfig, input: LlmGenerateInput): Promise<LlmGenerateResult> {
    const messages: Array<{ role: 'system' | 'user'; content: string }> = [];

    if (input.systemPrompt?.trim()) {
      messages.push({ role: 'system', content: input.systemPrompt });
    }

    messages.push({ role: 'user', content: input.prompt });

    const body: Record<string, unknown> = {
      model: input.model,
      messages,
      stream: false,
    };

    if (input.temperature !== undefined) {
      body.temperature = input.temperature;
    }

    let response: Response;

    try {
      response = await fetch(`${config.baseUrl.replace(/\/$/, '')}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      throw new LlmProviderError(`LLM request failed (${config.id}): ${reason}`);
    }

    if (!response.ok) {
      const errorText = await response.text();
      throw new LlmProviderError(
        `LLM request failed (${config.id}): ${response.status} ${errorText}`,
      );
    }

    const data = (await response.json()) as ChatCompletionResponse;
    const text = data.choices?.[0]?.message?.content;

    if (!text) {
      throw new LlmProviderError(`LLM provider "${config.id}" returned no text`);
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
}