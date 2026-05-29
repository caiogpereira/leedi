import { z } from 'zod';

export const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().url('DATABASE_URL must be a valid URL'),
  SENTRY_DSN: z.string().url('SENTRY_DSN must be a valid URL'),
  POSTHOG_KEY: z.string().min(1, 'POSTHOG_KEY is required'),
  BETTER_STACK_TOKEN: z.string().min(1, 'BETTER_STACK_TOKEN is required'),
  API_PORT: z.coerce.number().int().min(1024).max(65535).default(3003),
});

export type Env = z.infer<typeof schema>;
