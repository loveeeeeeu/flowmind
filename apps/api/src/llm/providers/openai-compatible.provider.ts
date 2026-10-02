import { Injectable } from '@nestjs/common';
import { LlmProviderError } from '../llm-provider.error.js';
import type { LlmGenerateInput, LlmGenerateResult, LlmProvider } from './llm-provider.js';

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
  async generate(input: LlmGenerateInput): Promise<LlmGenerateResult> {
    const baseUrl = process.env.LLM_BASE_URL;
    const apiKey = process.env.LLM_API_KEY;

    if (!baseUrl || !apiKey) {
      throw new Error('LLM_BASE_URL and LLM_API_KEY must be configured');
    }

    const messages: Array<{ role: 'system' | 'user'; content: string }> = [];

    if (input.systemPrompt) {
      messages.push({ role: 'system', content: input.systemPrompt });
    }

    messages.push({ role: 'user', content: input.prompt });

    let response: Response;

    try {
      response = await fetch(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: input.model,
          messages,
          temperature: input.temperature,
          stream: false,
        }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      throw new LlmProviderError(`LLM request failed: ${reason}`);
    }

    if (!response.ok) {
      const errorText = await response.text();
      throw new LlmProviderError(`LLM request failed: ${response.status} ${errorText}`);
    }

    const data = (await response.json()) as ChatCompletionResponse;
    const text = data.choices?.[0]?.message?.content;

    if (!text) {
      throw new LlmProviderError('LLM returned no text');
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