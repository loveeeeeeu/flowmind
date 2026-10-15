import { LlmProviderError } from './llm-provider.error.js';
import type { LlmProvider } from './llm-provider.js';
import type { SupportedProvider } from './provider-config.js';

/**
 * Credential provider -> protocol adapter. All three speak the OpenAI protocol today; a provider
 * with its own protocol (Anthropic, Gemini) gets its own adapter here.
 */
export class ProviderRegistry {
  constructor(private readonly openAiCompatible: LlmProvider) {}

  get(provider: SupportedProvider): LlmProvider {
    switch (provider) {
      case 'OPENAI':
      case 'DEEPSEEK':
      case 'OPENAI_COMPATIBLE':
        return this.openAiCompatible;
      default:
        throw new LlmProviderError({
          code: 'PROVIDER_NOT_SUPPORTED',
          retryable: false,
          message: `Unsupported provider: ${String(provider)}`,
        });
    }
  }
}
