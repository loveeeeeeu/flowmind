import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

const PREFIX_BYTES = 8;
const SECRET_BYTES = 32;

// The base64url alphabet contains "_", so the key cannot simply be split on "_".
const API_KEY_PATTERN = /^fm_([0-9a-f]{16})_([A-Za-z0-9_-]{43})$/;

export interface GeneratedApiKey {
  prefix: string;
  key: string;
  keyHash: string;
}

/**
 * fm_<prefix>_<secret>. The prefix locates the row without scanning every key; the 256-bit
 * secret is what makes the key unguessable. A fast hash is enough because the key is random,
 * unlike a user-chosen password that would need bcrypt/scrypt.
 */
export function generateApiKey(): GeneratedApiKey {
  const prefix = randomBytes(PREFIX_BYTES).toString('hex');
  const secret = randomBytes(SECRET_BYTES).toString('base64url');
  const key = `fm_${prefix}_${secret}`;

  return { prefix, key, keyHash: hashApiKey(key) };
}

export function hashApiKey(key: string) {
  return createHash('sha256').update(key).digest('hex');
}

/** Returns the lookup prefix, or null when the string cannot be a FlowMind key at all. */
export function parseApiKeyPrefix(key: string): string | null {
  return API_KEY_PATTERN.exec(key)?.[1] ?? null;
}

/** Constant-time comparison of two SHA-256 hex digests. */
export function hashesMatch(left: string, right: string) {
  const leftBuffer = Buffer.from(left, 'hex');
  const rightBuffer = Buffer.from(right, 'hex');

  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}
