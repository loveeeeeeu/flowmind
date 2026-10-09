export interface ExecutionErrorDetails {
  code: string;
  message: string;
}

export function normalizeExecutionError(
  error: unknown,
  fallbackCode: string,
  fallbackMessage: string,
): ExecutionErrorDetails {
  if (error && typeof error === 'object') {
    const candidate = error as { code?: unknown; message?: unknown };

    return {
      code: typeof candidate.code === 'string' ? candidate.code : fallbackCode,
      message:
        typeof candidate.message === 'string' && candidate.message.length > 0
          ? candidate.message
          : fallbackMessage,
    };
  }

  const message =
    typeof error === 'string'
      ? error
      : typeof error === 'number' ||
          typeof error === 'boolean' ||
          typeof error === 'bigint'
        ? String(error)
        : fallbackMessage;

  return {
    code: fallbackCode,
    message,
  };
}
