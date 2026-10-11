export interface NodeRetryPolicy {
  /** Total executions including the first one: 3 means first try + 2 retries. */
  maxAttempts: number;
  /** Delay before the next attempt, given the attempt that just failed (1-based). */
  backoffMs: (attempt: number) => number;
}

export const DEFAULT_NODE_RETRY_POLICY: NodeRetryPolicy = {
  maxAttempts: 3,
  backoffMs: (attempt) => 500 * 2 ** (attempt - 1),
};

/**
 * Only errors that explicitly say `retryable: true` (LLM 429/5xx, HTTP 5xx, network
 * failures, ...) are worth retrying; config errors like a missing variable fail the same way again.
 */
export function isRetryableError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { retryable?: unknown }).retryable === true
  );
}
