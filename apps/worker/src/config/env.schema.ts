import { z } from 'zod';
import { MASTER_KEY_PATTERN } from '@flowmind/shared';

// Deployment configuration only. Provider API keys and base URLs are product configuration:
// they live encrypted in the Credential table and are resolved per LLM call.
export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().min(1),
  REDIS_HOST: z.string().min(1).default('localhost'),
  REDIS_PORT: z.coerce.number().int().positive().default(6379),

  LLM_TIMEOUT_MS: z.coerce.number().int().positive().default(60_000),

  // Must be the api's key: the worker decrypts what the api encrypted.
  CREDENTIAL_ENCRYPTION_KEY: z
    .string({ error: 'is required (32 random bytes, base64)' })
    .regex(MASTER_KEY_PATTERN, 'must be 32 random bytes encoded as base64 (44 characters)'),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): Env {
  const result = envSchema.safeParse(config);

  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');

    throw new Error(`Invalid environment variables:\n${details}`);
  }

  return result.data;
}
