import { describe, expect, it } from 'vitest';
import { validateEnv } from '../validate.js';

// Complete valid fixture. Must include every REQUIRED schema var (no default / not
// optional). Vars with defaults (DASHBOARD_URL, WHATSAPP_API_VERSION, ASAAS_SANDBOX,
// TRANSCRIPTION_PROVIDER) and optional ones (GROQ/OPENAI keys) are intentionally omitted.
// Keep in sync with packages/config/src/schema.ts when new required vars are added.
const validEnv = {
  NODE_ENV: 'development',
  DATABASE_URL: 'postgresql://user:pass@localhost:5432/leedi',
  SENTRY_DSN: 'https://abc123@sentry.io/123456',
  POSTHOG_KEY: 'phc_examplekey',
  BETTER_STACK_TOKEN: 'example_token',
  API_PORT: '3003',
  BETTER_AUTH_SECRET: 'test-better-auth-secret-at-least-32-chars',
  BETTER_AUTH_URL: 'http://localhost:3000',
  RESEND_API_KEY: 're_example',
  UPSTASH_REDIS_REST_URL: 'https://example.upstash.io',
  UPSTASH_REDIS_REST_TOKEN: 'example_upstash_token',
  WORKSPACE_ID: '00000000-0000-0000-0000-000000000000',
  ANTHROPIC_API_KEY: 'sk-ant-example',
  ENCRYPTION_MASTER_KEY: 'BwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwc=',
  WHATSAPP_APP_SECRET: 'example_app_secret',
  WHATSAPP_WEBHOOK_VERIFY_TOKEN: 'example_verify_token',
  QSTASH_TOKEN: 'example_qstash_token',
  QSTASH_CURRENT_SIGNING_KEY: 'sig_current',
  QSTASH_NEXT_SIGNING_KEY: 'sig_next',
  ASAAS_API_KEY: 'example_asaas_key',
  ASAAS_WEBHOOK_TOKEN: 'example_asaas_webhook_token',
  VAPID_PUBLIC_KEY: 'example_vapid_public',
  VAPID_PRIVATE_KEY: 'example_vapid_private',
  VAPID_SUBJECT: 'mailto:test@leedi.digital',
} as const;

describe('validateEnv', () => {
  it('returns typed env on valid input', () => {
    const result = validateEnv(validEnv as NodeJS.ProcessEnv);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.env.NODE_ENV).toBe('development');
      expect(result.env.API_PORT).toBe(3003);
      expect(result.env.DATABASE_URL).toBe('postgresql://user:pass@localhost:5432/leedi');
    }
  });

  it('fails when DATABASE_URL is missing and names the field', () => {
    const { DATABASE_URL: _, ...withoutDb } = validEnv;
    const result = validateEnv(withoutDb as NodeJS.ProcessEnv);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.message).toContain('DATABASE_URL');
    }
  });

  it('fails when DATABASE_URL is not a valid URL', () => {
    const result = validateEnv({ ...validEnv, DATABASE_URL: 'not-a-url' } as NodeJS.ProcessEnv);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.message).toContain('DATABASE_URL');
    }
  });

  it('coerces API_PORT string to number', () => {
    const result = validateEnv({ ...validEnv, API_PORT: '4000' } as NodeJS.ProcessEnv);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.env.API_PORT).toBe(4000);
    }
  });

  it('uses default API_PORT when not provided', () => {
    const { API_PORT: _, ...withoutPort } = validEnv;
    const result = validateEnv(withoutPort as NodeJS.ProcessEnv);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.env.API_PORT).toBe(3003);
    }
  });
});
