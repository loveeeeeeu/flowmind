export class KnowledgeIngestionError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly retryable = false,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = 'KnowledgeIngestionError';
  }
}

export function normalizeKnowledgeError(error: unknown) {
  if (error && typeof error === 'object' && 'code' in error && 'message' in error) {
    const candidate = error as { code: unknown; message: unknown; retryable?: unknown };
    return {
      code: typeof candidate.code === 'string' ? candidate.code : 'KNOWLEDGE_INGESTION_FAILED',
      message: typeof candidate.message === 'string' ? candidate.message : 'Knowledge ingestion failed',
      retryable: candidate.retryable === true,
    };
  }
  return { code: 'KNOWLEDGE_INGESTION_FAILED', message: 'Knowledge ingestion failed', retryable: false };
}
