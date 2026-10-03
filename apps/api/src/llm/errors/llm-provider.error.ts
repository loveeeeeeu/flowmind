export type LlmProviderErrorCode =
  | 'AUTH_ERROR'
  | 'RATE_LIMIT'
  | 'INSUFFICIENT_BALANCE'
  | 'INVALID_REQUEST'
  | 'PROVIDER_UNAVAILABLE'
  | 'TIMEOUT'
  | 'NETWORK_ERROR'
  | 'EMPTY_RESPONSE'
  | 'UNKNOWN';

interface LlmProviderErrorOptions {
  providerId: string;
  code: LlmProviderErrorCode;
  message: string;
  status?: number;
  retryable?: boolean;
  cause?: unknown;
}

export class LlmProviderError extends Error {
  readonly providerId: string;
  readonly code: LlmProviderErrorCode;
  readonly status?: number;
  readonly retryable: boolean;

  constructor(options: LlmProviderErrorOptions) {
    super(options.message, { cause: options.cause });
    this.name = 'LlmProviderError';
    this.providerId = options.providerId;
    this.code = options.code;
    this.status = options.status;
    this.retryable = options.retryable ?? false;
  }
}