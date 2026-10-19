const SENSITIVE_KEYS = new Set([
  'authorization',
  'proxy-authorization',
  'cookie',
  'set-cookie',
  'apikey',
  'api_key',
  'x-api-key',
  'password',
  'secret',
  'token',
  'accesstoken',
  'refreshtoken',
  'encryptedsecret',
  'secretauthtag',
]);

function isSensitiveKey(key: string) {
  const normalized = key.toLowerCase();

  return (
    SENSITIVE_KEYS.has(normalized) ||
    normalized.includes('secret') ||
    normalized.includes('token') ||
    normalized.includes('password') ||
    normalized.includes('apikey')
  );
}

/** Defensive API projection. Persistence must still avoid storing secrets in the first place. */
export function sanitizeDebugValue(value: unknown): unknown {
  if (value === null || value === undefined || typeof value !== 'object') {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(sanitizeDebugValue);
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, child]) => [
      key,
      isSensitiveKey(key) ? '[REDACTED]' : sanitizeDebugValue(child),
    ]),
  );
}

export function sanitizeDebugMetadata(value: unknown): Record<string, unknown> | null {
  const sanitized = sanitizeDebugValue(value);

  return sanitized !== null && typeof sanitized === 'object' && !Array.isArray(sanitized)
    ? (sanitized as Record<string, unknown>)
    : null;
}
