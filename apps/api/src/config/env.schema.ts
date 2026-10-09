import { z } from 'zod';

const optionalUrl = z.string().url().optional().or(z.literal(''));

export const envSchema = z
  .object({
    NODE_ENV: z
      .enum(['development', 'test', 'production'])
      .default('development'),
    PORT: z.coerce.number().int().positive().default(3000),
    DATABASE_URL: z.string().min(1),
    REDIS_HOST: z.string().min(1).default('localhost'),
    REDIS_PORT: z.coerce.number().int().positive().default(6379),

    DEEPSEEK_API_KEY: z.string().optional(),
    DEEPSEEK_BASE_URL: optionalUrl,
    OPENAI_API_KEY: z.string().optional(),
    OPENAI_BASE_URL: optionalUrl,
    CUSTOM_LLM_API_KEY: z.string().optional(),
    CUSTOM_LLM_BASE_URL: optionalUrl,

    LLM_TIMEOUT_MS: z.coerce.number().int().positive().default(60_000),
  })
  .superRefine((env, ctx) => {
    const hasCustomKey = Boolean(env.CUSTOM_LLM_API_KEY);
    const hasCustomUrl = Boolean(env.CUSTOM_LLM_BASE_URL);

    if (hasCustomKey !== hasCustomUrl) {
      ctx.addIssue({
        code: 'custom',
        message:
          'CUSTOM_LLM_API_KEY and CUSTOM_LLM_BASE_URL must be configured together',
        path: ['CUSTOM_LLM_API_KEY'],
      });
    }
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
