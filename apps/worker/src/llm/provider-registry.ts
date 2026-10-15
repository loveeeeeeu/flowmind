import { Injectable } from '@nestjs/common';
import { WorkflowExecutionError } from '@flowmind/workflow-core';
import type { CredentialProvider } from '../generated/prisma/enums.js';
import { OpenAICompatibleProvider } from './providers/openai-compatible.provider.js';
import type { LlmProvider } from './providers/llm-provider.js';

/** Used when a credential leaves baseUrl empty. A compatible server has no official endpoint. */
const DEFAULT_BASE_URLS: Partial<Record<CredentialProvider, string>> = {
  OPENAI: 'https://api.openai.com/v1',
  DEEPSEEK: 'https://api.deepseek.com',
};

/** The credential's own base URL overrides the provider default. */
export function resolveBaseUrl(provider: CredentialProvider, baseUrl: string | null): string {
  const resolved = baseUrl || DEFAULT_BASE_URLS[provider];

  if (!resolved) {
    throw new WorkflowExecutionError(`${provider} credential requires a base URL`, {
      code: 'CREDENTIAL_BASE_URL_REQUIRED',
      retryable: false,
    });
  }

  return resolved;
}

/**
 * Credential provider -> protocol adapter. All three speak Chat Completions today; a provider
 * with its own protocol (Anthropic, Gemini) gets its own adapter here.
 */
@Injectable()
export class ProviderRegistry {
  constructor(private readonly openAiCompatible: OpenAICompatibleProvider) {}

  get(provider: CredentialProvider): LlmProvider {
    switch (provider) {
      case 'OPENAI':
      case 'DEEPSEEK':
      case 'OPENAI_COMPATIBLE':
        return this.openAiCompatible;
      default:
        throw new WorkflowExecutionError(`Unsupported provider: ${String(provider)}`, {
          code: 'PROVIDER_NOT_SUPPORTED',
          retryable: false,
        });
    }
  }
}
