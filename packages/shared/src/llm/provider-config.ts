import { LlmProviderError } from './llm-provider.error.js';

/** Mirrors the CredentialProvider enum of the Prisma schema. */
export type SupportedProvider = 'OPENAI' | 'DEEPSEEK' | 'OPENAI_COMPATIBLE';

/** Used when a credential leaves baseUrl empty. A compatible server has no official endpoint. */
export const DEFAULT_BASE_URLS: Partial<Record<SupportedProvider, string>> = {
  OPENAI: 'https://api.openai.com/v1',
  DEEPSEEK: 'https://api.deepseek.com',
};

/** "https://example.com/v1/" + "/models" must not become "...v1//models". */
export function normalizeBaseUrl(baseUrl: string) {
  return baseUrl.replace(/\/+$/, '');
}

/**
 * The one rule for where a credential's requests go, shared by the api (connection tests, model
 * discovery) and the worker (runs): the credential's own base URL, else the provider default.
 */
export function resolveProviderBaseUrl(params: {
  provider: SupportedProvider;
  baseUrl?: string | null;
}): string {
  const baseUrl = params.baseUrl || DEFAULT_BASE_URLS[params.provider];

  if (!baseUrl) {
    throw new LlmProviderError({
      code: 'CREDENTIAL_BASE_URL_REQUIRED',
      retryable: false,
      message: `${params.provider} credential requires a base URL`,
    });
  }

  let parsed: URL;
  try {
    parsed = new URL(baseUrl);
  } catch {
    throw new LlmProviderError({
      code: 'NETWORK_ERROR',
      retryable: false,
      message: `Invalid base URL: "${baseUrl}"`,
    });
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new LlmProviderError({
      code: 'NETWORK_ERROR',
      retryable: false,
      message: `Base URL protocol must be http or https, got "${parsed.protocol}"`,
    });
  }

  return normalizeBaseUrl(baseUrl);
}
