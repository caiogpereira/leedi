import { z } from 'zod';

export const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().url('DATABASE_URL must be a valid URL'),
  // RLS-enforced application connection (Story 2.4 / Workstream B). When set, it
  // points at a NON-BYPASSRLS role (e.g. `leedi_app`) used ONLY by the
  // `withTenant`/`withUser` tenant-data path, so RLS policies are actually
  // enforced there. OPTIONAL: when unset, that path falls back to DATABASE_URL and
  // behavior is unchanged (RLS bypassed under the privileged role). The deliberate
  // service-role path (`withServiceRole`) and direct `db` access always use
  // DATABASE_URL.
  APP_DATABASE_URL: z.string().url('APP_DATABASE_URL must be a valid URL').optional(),
  SENTRY_DSN: z.string().url('SENTRY_DSN must be a valid URL'),
  POSTHOG_KEY: z.string().min(1, 'POSTHOG_KEY is required'),
  BETTER_STACK_TOKEN: z.string().min(1, 'BETTER_STACK_TOKEN is required'),
  API_PORT: z.coerce.number().int().min(1024).max(65535).default(3003),
  BETTER_AUTH_SECRET: z.string().min(32, 'BETTER_AUTH_SECRET must be at least 32 chars'),
  BETTER_AUTH_URL: z.string().url('BETTER_AUTH_URL must be a valid URL'),
  DASHBOARD_URL: z.string().url('DASHBOARD_URL must be a valid URL').default('http://localhost:3001'),
  // Super-admin app origin. Used by the dashboard to send an admin back to their
  // admin context when they exit impersonation (the impersonating super_admin has
  // no membership, so landing on the dashboard root shows "Nenhum workspace").
  ADMIN_URL: z.string().url('ADMIN_URL must be a valid URL').default('http://localhost:3002'),
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
  // Audio transcription (Story 7.7). Provider selection is platform-level, not
  // per-tenant. Keys are OPTIONAL at boot — many tenants never receive audio —
  // and validated LAZILY at first audio use (see groq-whisper-adapter.ts), so the
  // app does not fail to start just because audio support is unconfigured.
  TRANSCRIPTION_PROVIDER: z.enum(['groq', 'openai', 'deepgram']).default('groq'),
  GROQ_API_KEY: z.string().min(1).optional(),
  OPENAI_API_KEY: z.string().min(1).optional(),
  // Asaas billing (Story 17.1)
  ASAAS_API_KEY: z.string().min(1, 'ASAAS_API_KEY is required'),
  ASAAS_SANDBOX: z.coerce.boolean().default(false),
  ASAAS_WEBHOOK_TOKEN: z.string().min(1, 'ASAAS_WEBHOOK_TOKEN is required'),
  // Web Push / VAPID (Story 18.1) — generate once via: npx web-push generate-vapid-keys
  VAPID_PUBLIC_KEY: z.string().min(1, 'VAPID_PUBLIC_KEY is required'),
  VAPID_PRIVATE_KEY: z.string().min(1, 'VAPID_PRIVATE_KEY is required'),
  VAPID_SUBJECT: z.string().url('VAPID_SUBJECT must be a mailto: or https: URL'),
  // Admin operational dashboard margin estimate (Story 20.3). Fixed USD→BRL rate;
  // update manually when the rate moves significantly. V2 may fetch a live rate.
  USD_TO_BRL_RATE: z.coerce.number().positive().default(5.0),
});

export type Env = z.infer<typeof schema>;
