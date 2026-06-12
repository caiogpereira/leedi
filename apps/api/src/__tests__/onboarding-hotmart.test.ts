import { describe, expect, it, vi, afterEach } from 'vitest';

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
    QSTASH_TOKEN: 'test_qstash',
    QSTASH_CURRENT_SIGNING_KEY: 'test_sign',
    QSTASH_NEXT_SIGNING_KEY: 'test_sign_next',
  },
}));

vi.mock('@leedi/observability', () => ({
  runWithContext: vi.fn((ctx: unknown, fn: () => unknown) => fn()),
  getContext: vi.fn(() => ({ request_id: 'test-req-id' })),
  captureException: vi.fn(),
  initSentry: vi.fn(),
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('@leedi/auth', () => ({
  getSession: vi.fn(),
}));

vi.mock('@leedi/gateway', () => ({
  HotmartNormalizer: {
    normalize: vi.fn(() => ({
      eventoCanonical: null,
      hotmartTransactionId: null,
    })),
  },
}));

vi.mock('@upstash/qstash', () => {
  class Client { publishJSON = vi.fn().mockResolvedValue({ messageId: 'q1' }); }
  return { Client };
});

const tenantConfig = vi.hoisted(() => ({
  value: {} as Record<string, unknown>,
}));
const executeCallArgs = vi.hoisted(() => ({ calls: [] as string[] }));

vi.mock('@leedi/db', () => ({
  db: {
    transaction: vi.fn(async (_fn: (tx: unknown) => unknown) =>
      _fn({
        execute: vi.fn().mockResolvedValue({ rows: [{ id: 'gi-1', tenantId: 'tenant-1', webhookSecret: 'tok123', gateway: 'hotmart', ativo: true }] }),
        select: () => ({
          from: () => ({
            where: () => ({
              limit: async () => [{ id: 'gi-1', tenantId: 'tenant-1', webhookSecret: 'tok123', gateway: 'hotmart', ativo: true }],
            }),
          }),
        }),
      })
    ),
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  withTenant: vi.fn((_tid: string, fn: (tx: any) => Promise<unknown>) =>
    fn({
      select: () => ({
        from: () => ({
          where: () => ({
            limit: async () => [{ config: tenantConfig.value }],
          }),
        }),
      }),
      insert: vi.fn(() => ({ values: vi.fn().mockResolvedValue([{ id: 'ge-1' }]) })),
      execute: vi.fn((q: unknown) => {
        executeCallArgs.calls.push(String(q));
        return Promise.resolve({ rows: [] });
      }),
    })
  ),
  schema: {
    gatewayIntegrations: { webhookUrlPath: 'webhookUrlPath', id: 'id', tenantId: 'tenantId', webhookSecret: 'webhookSecret', gateway: 'gateway', ativo: 'ativo' },
    gatewayEvents: { tenantId: 'tenantId' },
    tenants: { id: 'id', config: 'config' },
  },
  eq: vi.fn((_a: unknown, _b: unknown) => true),
  // Embed the interpolated args in the captured string so assertions can inspect
  // the jsonb payload (onboarding_config / gateway_webhook_received) — otherwise
  // the values live only in the args array and the SET write is invisible to tests.
  sql: vi.fn((s: TemplateStringsArray, ...args: unknown[]) => s.join('?') + JSON.stringify(args)),
}));

const TENANT_ID = '00000000-0000-0000-0000-000000000042';

describe('Hotmart webhook — onboarding gateway flag', () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    executeCallArgs.calls = [];
    tenantConfig.value = {};
  });

  async function buildApp() {
    const { Hono } = await import('hono');
    const { createHotmartWebhookRouter } = await import('../routes/webhooks/hotmart.js');
    const { requestContextMiddleware, errorHandler } = await import('../middleware/request-context.js');
    const app = new Hono();
    app.use('*', requestContextMiddleware);
    app.onError(errorHandler);
    app.route('/webhooks/hotmart', createHotmartWebhookRouter());
    return app;
  }

  it('sets gateway_webhook_received when current_step is 3', async () => {
    tenantConfig.value = {
      onboarding_config: { current_step: 3, onboarding_completed: false, steps: {} },
    };

    const app = await buildApp();
    const res = await app.request('/webhooks/hotmart/abc-path?hottok=tok123', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event: 'PURCHASE_APPROVED', data: {} }),
    });

    expect(res.status).toBe(200);

    // The flag-set is fire-and-forget — poll instead of a fixed sleep (avoids flake).
    await vi.waitFor(() => {
      const updateCalls = executeCallArgs.calls.filter(
        (s) => s.includes('gateway_webhook_received') && s.includes('onboarding_config')
      );
      expect(updateCalls.length).toBeGreaterThanOrEqual(1);
    });
  });

  it('does NOT set gateway_webhook_received when current_step is NOT 3', async () => {
    tenantConfig.value = {
      onboarding_config: { current_step: 5, onboarding_completed: true, steps: {} },
    };

    const app = await buildApp();
    const res = await app.request('/webhooks/hotmart/abc-path?hottok=tok123', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event: 'PURCHASE_APPROVED', data: {} }),
    });

    expect(res.status).toBe(200);
    // Give the fire-and-forget guard a chance to run, then assert it wrote nothing.
    await new Promise((r) => setTimeout(r, 50));

    // The early-return guard (current_step !== 3) must skip the SET entirely —
    // no jsonb write touching gateway_webhook_received for completed onboarding.
    const updateCalls = executeCallArgs.calls.filter((s) =>
      s.includes('gateway_webhook_received')
    );
    expect(updateCalls.length).toBe(0);
  });
});
