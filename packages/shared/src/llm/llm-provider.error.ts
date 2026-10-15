export type LlmProviderErrorCode =
  // Configuration: the credential cannot be called as configured.
  | 'CREDENTIAL_BASE_URL_REQUIRED'
  | 'PROVIDER_NOT_SUPPORTED'
  // Provider HTTP responses.
  | 'AUTH_ERROR'
  | 'RATE_LIMIT'
  | 'INSUFFICIENT_BALANCE'
  | 'INVALID_REQUEST'
  | 'ENDPOINT_NOT_FOUND'
  | 'PROVIDER_UNAVAILABLE'
  | 'INVALID_PROVIDER_RESPONSE'
  | 'EMPTY_RESPONSE'
  | 'UNKNOWN'
  // Transport.
  | 'TIMEOUT'
  | 'NETWORK_ERROR';

interface LlmProviderErrorOptions {
  code: LlmProviderErrorCode;
  message: string;
  status?: number;
  retryable?: boolean;
  cause?: unknown;
}

/** `retryable` is what the workflow engine's retry policy reads. Messages never contain the API key. */
export class LlmProviderError extends Error {
  readonly code: LlmProviderErrorCode;
  readonly status?: number;
  readonly retryable: boolean;

  constructor(options: LlmProviderErrorOptions) {
    super(options.message, { cause: options.cause });
    this.name = 'LlmProviderError';
    this.code = options.code;
    this.status = options.status;
    this.retryable = options.retryable ?? false;
  }
}
