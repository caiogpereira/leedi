import { describe, expect, it, vi, beforeAll } from 'vitest';
import type { Hono } from 'hono';

let app: Hono;

beforeAll(async () => {
  const mod = await import('../app.js');
  app = mod.app;
}, 30000);

const TEST_KEY = Buffer.alloc(32, 0xab).toString('base64');

vi.mock('@leedi/config', () => ({
  env: {
    DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
    NODE_ENV: 'development' as const,
    SENTRY_DSN: 'https://test@sentry.io/1',
    POSTHOG_KEY: 'phc_test',
    BETTER_STACK_TOKEN: 'test_token',
    API_PORT: 3003,
    UPSTASH_REDIS_REST_URL: 'https://test.upstash.io',
    UPSTASH_REDIS_REST_TOKEN: 'test_token',
    BETTER_AUTH_SECRET: 'supersecretkey_at_least_32_chars_long!!',
    BETTER_AUTH_URL: 'http://localhost:3000',
    DASHBOARD_URL: 'http://localhost:3001',
    RESEND_API_KEY: 'test_resend',
    WORKSPACE_ID: '00000000-0000-0000-0000-000000000001',
    ANTHROPIC_API_KEY: 'test_anthropic',
    ENCRYPTION_MASTER_KEY: TEST_KEY,
    WHATSAPP_API_VERSION: 'v20.0',
  },
}));

vi.mock('@leedi/observability', () => ({
  runWithContext: vi.fn((ctx: unknown, fn: () => unknown) => fn()),
  getContext: vi.fn(() => ({ request_id: 'test-req-id' })),
  captureException: vi.fn(),
  initSentry: vi.fn(),
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('@leedi/auth', () => ({ getSession: vi.fn() }));

vi.mock('@upstash/qstash', () => {
  class Receiver { verify = vi.fn().mockResolvedValue(true); }
  class Client { publishJSON = vi.fn().mockResolvedValue({ messageId: 'q1' }); }
  return { Receiver, Client };
});

vi.mock('@leedi/db', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  withUser: vi.fn((_uid: string, fn: (tx: any) => Promise<unknown>) => fn({})),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  withTenant: vi.fn((_tid: string, fn: (tx: any) => Promise<unknown>) => fn({})),
  schema: { memberships: {}, whatsappConnections: {} },
  eq: vi.fn(),
  and: vi.fn(),
}));

vi.mock('@leedi/connection', () => ({
  connectWhatsappNumber: vi.fn(),
  InvalidCredentialsError: class InvalidCredentialsError extends Error {},
  MetaCloudProvider: vi.fn(),
  checkConnectionHealth: vi.fn(),
}));

vi.mock('@anthropic-ai/sdk', () => {
  class MockAnthropic {
    messages = { create: vi.fn() };
    beta = { messages: { create: vi.fn() } };
  }
  return { default: MockAnthropic };
});

vi.mock('@leedi/agent', () => ({
  processMessage: vi.fn().mockResolvedValue({ status: 'ok' }),
  buildSystemPrompt: vi.fn().mockReturnValue(''),
  buildToolList: vi.fn().mockReturnValue([]),
  routeToolCall: vi.fn(),
  modelIdForTask: vi.fn().mockReturnValue('claude-sonnet-4-6'),
  resolveEnabledTools: vi.fn().mockReturnValue({}),
}));

vi.mock('@leedi/gateway', () => ({
  HotmartNormalizer: { normalize: vi.fn() },
}));

describe('GET /health', () => {
  it('returns 200 with status ok and env', async () => {
    const res = await app.request('/health');
    expect(res.status).toBe(200);
    const body = await res.json() as { status: string; env: string };
    expect(body.status).toBe('ok');
    expect(body.env).toBe('development');
  });
});
