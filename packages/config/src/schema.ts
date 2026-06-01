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
  DASHBOARD_URL: z.string().url('DASHBOARD_URL must be a valid URL').default('http://localhost:3001'),
  RESEND_API_KEY: z.string().min(1, 'RESEND_API_KEY is required'),
  UPSTASH_REDIS_REST_URL: z.string().url('UPSTASH_REDIS_REST_URL must be a valid URL'),
  UPSTASH_REDIS_REST_TOKEN: z.string().min(1, 'UPSTASH_REDIS_REST_TOKEN is required'),
  WORKSPACE_ID: z.string().uuid('WORKSPACE_ID must be a valid UUID'),
  ANTHROPIC_API_KEY: z.string().min(1, 'ANTHROPIC_API_KEY is required'),
  ENCRYPTION_MASTER_KEY: z
    .string()
    .refine(
      (v) => {
        try {
          return Buffer.from(v, 'base64').length === 32;
        } catch {
          return false;
        }
      },
      { message: 'ENCRYPTION_MASTER_KEY must be a base64-encoded 32-byte key' }
    ),
  WHATSAPP_API_VERSION: z.string().default('v20.0'),
  // Meta webhook verification — obtained from the Meta Developer App (App Settings > Basic)
  WHATSAPP_APP_SECRET: z.string().min(1, 'WHATSAPP_APP_SECRET is required'),
  // Custom token you choose when registering the webhook endpoint in the Meta Developer App
  WHATSAPP_WEBHOOK_VERIFY_TOKEN: z.string().min(1, 'WHATSAPP_WEBHOOK_VERIFY_TOKEN is required'),
  // QStash (Upstash) — for scheduled health checks and debounce flush jobs
  QSTASH_TOKEN: z.string().min(1, 'QSTASH_TOKEN is required'),
  QSTASH_CURRENT_SIGNING_KEY: z.string().min(1, 'QSTASH_CURRENT_SIGNING_KEY is required'),
  QSTASH_NEXT_SIGNING_KEY: z.string().min(1, 'QSTASH_NEXT_SIGNING_KEY is required'),
});

export type Env = z.infer<typeof schema>;
