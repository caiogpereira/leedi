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

vi.mock('@leedi/db', () => ({
   
  db: { insert: vi.fn(() => ({ values: vi.fn().mockResolvedValue([]) })) },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  withUser: vi.fn((_uid: string, fn: (tx: any) => Promise<unknown>) => fn({})),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  withTenant: vi.fn((_tid: string, fn: (tx: any) => Promise<unknown>) => fn({})),
  schema: {
    memberships: { userId: 'userId', tenantId: 'tenantId', role: 'role' },
    tenants: { id: 'id', config: 'config', status: 'status', workspaceId: 'workspaceId', name: 'name', logoUrl: 'logo_url' },
    auditLogs: {},
    gatewayIntegrations: { tenantId: 'tenantId', webhookUrlPath: 'webhookUrlPath' },
  },
  eq: vi.fn((_a: unknown, _b: unknown) => true),
  and: vi.fn((...args: unknown[]) => args),
  sql: vi.fn(),
}));

vi.mock('@upstash/redis', () => ({
  Redis: vi.fn(() => ({
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue('OK'),
  })),
}));

const TENANT_ID = '00000000-0000-0000-0000-000000000042';

describe('Onboarding routes', () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  async function buildApp() {
    const { Hono } = await import('hono');
    const { createOnboardingRouter } = await import('../routes/onboarding.js');
    const { requestContextMiddleware, errorHandler } = await import(
      '../middleware/request-context.js'
    );
    const app = new Hono();
    app.use('*', requestContextMiddleware);
    app.onError(errorHandler);
    app.route('/api/tenants/:tenantId/onboarding', createOnboardingRouter());
    return app;
  }

  // Helper: set up owner session + withUser returning owner role
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async function setupOwnerSession(tenantConfig: any = {}) {
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
          select: () => ({
            from: () => ({
              where: () => ({
                limit: async () => [{ role: 'owner' }],
              }),
            }),
          }),
        })
    );

    vi.mocked(withTenant).mockImplementation(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      async (_tid: string, fn: (tx: any) => Promise<unknown>) =>
        fn({
          select: () => ({
            from: () => ({
              where: () => ({
                limit: async () => [{ config: tenantConfig, status: 'trial', workspaceId: 'ws-1' }],
              }),
            }),
          }),
          update: () => ({ set: () => ({ where: () => Promise.resolve([]) }) }),
          execute: vi.fn().mockResolvedValue({ rows: [] }),
        })
    );
  }

  describe('GET /progress', () => {
    it('returns currentStep=1 when tenant has no onboarding config', async () => {
      await setupOwnerSession({});

      const app = await buildApp();
      const res = await app.request(
        `/api/tenants/${TENANT_ID}/onboarding/progress`,
        { method: 'GET' }
      );
      expect(res.status).toBe(200);
      const body = await res.json() as { currentStep: number; completedSteps: number[] };
      expect(body.currentStep).toBe(1);
      expect(body.completedSteps).toEqual([]);
    });

    it('returns completed steps when steps 1 and 2 are done', async () => {
      await setupOwnerSession({
        onboarding_config: {
          onboarding_completed: false,
          current_step: 3,
          steps: { 1: { nome: 'Test' }, 2: { phone_number_id: '123' } },
        },
      });

      const app = await buildApp();
      const res = await app.request(
        `/api/tenants/${TENANT_ID}/onboarding/progress`,
        { method: 'GET' }
      );
      expect(res.status).toBe(200);
      const body = await res.json() as { currentStep: number; completedSteps: number[] };
      expect(body.currentStep).toBe(3);
      expect(body.completedSteps).toEqual([1, 2]);
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
            select: () => ({
              from: () => ({
                where: () => ({ limit: async () => [{ role: 'operator' }] }),
              }),
            }),
          })
      );

      const app = await buildApp();
      const res = await app.request(
        `/api/tenants/${TENANT_ID}/onboarding/progress`,
        { method: 'GET' }
      );
      expect(res.status).toBe(403);
    });
  });

  describe('PATCH /progress', () => {
    it('advances currentStep from 1 to 2', async () => {
      await setupOwnerSession({});

      const app = await buildApp();
      const res = await app.request(
        `/api/tenants/${TENANT_ID}/onboarding/progress`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ step: 1, data: { nome: 'Empresa Teste' } }),
        }
      );
      expect(res.status).toBe(200);
      const body = await res.json() as { currentStep: number; completedSteps: number[] };
      expect(body.currentStep).toBe(2);
      expect(body.completedSteps).toEqual([1]);
    });

    it('does not regress currentStep when step was already passed (idempotent)', async () => {
      await setupOwnerSession({
        onboarding_config: {
          onboarding_completed: false,
          current_step: 3,
          steps: { 1: { nome: 'Old' }, 2: { phone_number_id: '123' } },
        },
      });

      const app = await buildApp();
      const res = await app.request(
        `/api/tenants/${TENANT_ID}/onboarding/progress`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ step: 1, data: { nome: 'New Name' } }),
        }
      );
      expect(res.status).toBe(200);
      const body = await res.json() as { currentStep: number };
      // current_step must not regress below 3
      expect(body.currentStep).toBe(3);
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
            select: () => ({
              from: () => ({
                where: () => ({ limit: async () => [{ role: 'operator' }] }),
              }),
            }),
          })
      );

      const app = await buildApp();
      const res = await app.request(
        `/api/tenants/${TENANT_ID}/onboarding/progress`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ step: 1, data: {} }),
        }
      );
      expect(res.status).toBe(403);
    });
  });
});
