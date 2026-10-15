import { LlmProviderError } from './llm-provider.error.js';

const MAX_BODY_LENGTH = 500;

function summarize(body: string) {
  return body.length > MAX_BODY_LENGTH ? `${body.slice(0, MAX_BODY_LENGTH)}...` : body;
}

/** `body` must already be redacted: parts of it end up in the message. */
export function createHttpProviderError(status: number, body: string) {
  switch (status) {
    case 400:
    case 422:
      return new LlmProviderError({
        code: 'INVALID_REQUEST',
        status,
        retryable: false,
        message: `LLM provider rejected the request: ${summarize(body)}`,
      });

    case 401:
    case 403:
      return new LlmProviderError({
        code: 'AUTH_ERROR',
        status,
        retryable: false,
        message: 'LLM provider authentication failed',
      });

    case 402:
      return new LlmProviderError({
        code: 'INSUFFICIENT_BALANCE',
        status,
        retryable: false,
        message: 'LLM provider balance is insufficient',
      });

    // Usually a wrong Base URL (missing /v1), or an unknown model name on chat calls.
    case 404:
      return new LlmProviderError({
        code: 'ENDPOINT_NOT_FOUND',
        status,
        retryable: false,
        message: `LLM provider returned 404 Not Found: ${summarize(body)}`,
      });

    case 429:
      return new LlmProviderError({
        code: 'RATE_LIMIT',
        status,
        retryable: true,
        message: 'LLM provider rate limit exceeded',
      });

    case 500:
    case 502:
    case 503:
    case 504:
      return new LlmProviderError({
        code: 'PROVIDER_UNAVAILABLE',
        status,
        retryable: true,
        message: `LLM provider is temporarily unavailable (${status})`,
      });

    default:
      return new LlmProviderError({
        code: 'UNKNOWN',
        status,
        retryable: status >= 500,
        message: `LLM provider request failed (${status}): ${summarize(body)}`,
      });
  }
}
