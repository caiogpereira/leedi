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
  hasPermission: vi.fn(),
}));

vi.mock('@upstash/qstash', () => {
  class Client { publishJSON = vi.fn().mockResolvedValue({ messageId: 'q1' }); }
  return { Client };
});

vi.mock('@leedi/db', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: { insert: vi.fn(() => ({ values: vi.fn().mockResolvedValue([]) })) },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  withUser: vi.fn((_uid: string, fn: (tx: any) => Promise<unknown>) => fn({})),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  withTenant: vi.fn((_tid: string, fn: (tx: any) => Promise<unknown>) => fn({})),
  schema: {
    memberships: { userId: 'userId', tenantId: 'tenantId', role: 'role' },
    tenants: {
      id: 'id', config: 'config', status: 'status',
      workspaceId: 'workspaceId', name: 'name', logoUrl: 'logo_url',
    },
    auditLogs: {},
    gatewayIntegrations: { tenantId: 'tenantId', webhookUrlPath: 'webhookUrlPath' },
  },
  eq: vi.fn((_a: unknown, _b: unknown) => true),
  and: vi.fn((...args: unknown[]) => args),
  sql: vi.fn(),
}));

const TENANT_ID = '00000000-0000-0000-0000-000000000042';

describe('POST /api/tenants/:tenantId/onboarding/complete', () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  async function buildApp() {
    const { Hono } = await import('hono');
    const { createOnboardingRouter } = await import('../routes/onboarding.js');
    const { requestContextMiddleware, errorHandler } = await import('../middleware/request-context.js');
    const app = new Hono();
    app.use('*', requestContextMiddleware);
    app.onError(errorHandler);
    app.route('/api/tenants/:tenantId/onboarding', createOnboardingRouter());
    return app;
  }

  it('sets status to active and returns success', async () => {
    const { getSession } = await import('@leedi/auth');
    const { withUser, withTenant } = await import('@leedi/db');

    vi.mocked(getSession).mockResolvedValue({
      user: { id: 'user-1', email: 'u@test.com', name: 'User' },
      session: { id: 'sess-1', userId: 'user-1', expiresAt: new Date() },
    } as Awaited<ReturnType<typeof getSession>>);

    vi.mocked(withUser).mockImplementation(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      async (_uid: string, fn: (tx: any) => Promise<unknown>) =>
        fn({
          select: () => ({ from: () => ({ where: () => ({ limit: async () => [{ role: 'owner' }] }) }) }),
        })
    );

    vi.mocked(withTenant).mockImplementation(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      async (_tid: string, fn: (tx: any) => Promise<unknown>) =>
        fn({
          select: () => ({
            from: () => ({
              where: () => ({
                limit: async () => [{ config: {}, status: 'trial', workspaceId: 'ws-1' }],
              }),
            }),
          }),
          update: () => ({ set: () => ({ where: () => Promise.resolve([]) }) }),
          execute: vi.fn().mockResolvedValue({ rows: [] }),
        })
    );

    const app = await buildApp();
    const res = await app.request(`/api/tenants/${TENANT_ID}/onboarding/complete`, {
      method: 'POST',
    });
    expect(res.status).toBe(200);
    const body = await res.json() as { success: boolean };
    expect(body.success).toBe(true);
  });

  it('is idempotent — returns 200 when already completed', async () => {
    const { getSession } = await import('@leedi/auth');
    const { withUser, withTenant } = await import('@leedi/db');

    vi.mocked(getSession).mockResolvedValue({
      user: { id: 'user-1', email: 'u@test.com', name: 'User' },
      session: { id: 'sess-1', userId: 'user-1', expiresAt: new Date() },
    } as Awaited<ReturnType<typeof getSession>>);

    vi.mocked(withUser).mockImplementation(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      async (_uid: string, fn: (tx: any) => Promise<unknown>) =>
        fn({
          select: () => ({ from: () => ({ where: () => ({ limit: async () => [{ role: 'owner' }] }) }) }),
        })
    );

    vi.mocked(withTenant).mockImplementation(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      async (_tid: string, fn: (tx: any) => Promise<unknown>) =>
        fn({
          select: () => ({
            from: () => ({
              where: () => ({
                limit: async () => [{
                  config: { onboarding_config: { onboarding_completed: true, current_step: 5, steps: {} } },
                  status: 'active',
                  workspaceId: 'ws-1',
                }],
              }),
            }),
          }),
          update: () => ({ set: () => ({ where: () => Promise.resolve([]) }) }),
          execute: vi.fn().mockResolvedValue({ rows: [] }),
        })
    );

    const app = await buildApp();
    const res = await app.request(`/api/tenants/${TENANT_ID}/onboarding/complete`, {
      method: 'POST',
    });
    expect(res.status).toBe(200);
  });

  it('returns 403 for operator role', async () => {
    const { getSession } = await import('@leedi/auth');
    const { withUser } = await import('@leedi/db');

    vi.mocked(getSession).mockResolvedValue({
      user: { id: 'user-1', email: 'u@test.com', name: 'User' },
      session: { id: 'sess-1', userId: 'user-1', expiresAt: new Date() },
    } as Awaited<ReturnType<typeof getSession>>);

    vi.mocked(withUser).mockImplementation(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      async (_uid: string, fn: (tx: any) => Promise<unknown>) =>
        fn({
          select: () => ({ from: () => ({ where: () => ({ limit: async () => [{ role: 'operator' }] }) }) }),
        })
    );

    const app = await buildApp();
    const res = await app.request(`/api/tenants/${TENANT_ID}/onboarding/complete`, {
      method: 'POST',
    });
    expect(res.status).toBe(403);
  });
});
