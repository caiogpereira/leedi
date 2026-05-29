import { z } from 'zod';

export const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().url('DATABASE_URL must be a valid URL'),
  SENTRY_DSN: z.string().url('SENTRY_DSN must be a valid URL'),
  POSTHOG_KEY: z.string().min(1, 'POSTHOG_KEY is required'),
  BETTER_STACK_TOKEN: z.string().min(1, 'BETTER_STACK_TOKEN is required'),
  API_PORT: z.coerce.number().int().min(1024).max(65535).default(3003),
  BETTER_AUTH_SECRET: z.string().min(32, 'BETTER_AUTH_SECRET must be at least 32 chars'),
  BETTER_AUTH_URL: z.string().url('BETTER_AUTH_URL must be a valid URL'),
  RESEND_API_KEY: z.string().min(1, 'RESEND_API_KEY is required'),
  UPSTASH_REDIS_REST_URL: z.string().url('UPSTASH_REDIS_REST_URL must be a valid URL'),
  UPSTASH_REDIS_REST_TOKEN: z.string().min(1, 'UPSTASH_REDIS_REST_TOKEN is required'),
});

export type Env = z.infer<typeof schema>;
