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
  },
}));

vi.mock('@leedi/observability', () => ({
  runWithContext: vi.fn((ctx: unknown, fn: () => unknown) => fn()),
  getContext: vi.fn(() => ({ request_id: 'test-req-id' })),
  captureException: vi.fn(),
  initSentry: vi.fn(),
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// Mock better-auth session reader
vi.mock('@leedi/auth', () => ({
  getSession: vi.fn(),
  hasPermission: vi.fn(),
}));

vi.mock('@upstash/qstash', () => {
  class Receiver { verify = vi.fn().mockResolvedValue(true); }
  class Client { publishJSON = vi.fn().mockResolvedValue({ messageId: 'q1' }); }
  return { Receiver, Client };
});

// Mock DB for membership queries and whatsapp connection queries
vi.mock('@leedi/db', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  withUser: vi.fn((_uid: string, fn: (tx: any) => Promise<unknown>) => fn({})),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  withTenant: vi.fn((_tid: string, fn: (tx: any) => Promise<unknown>) => fn({})),
  schema: {
    memberships: { userId: 'userId', tenantId: 'tenantId', role: 'role' },
    whatsappConnections: {
      tenantId: 'tenantId',
      phoneNumberId: 'phoneNumberId',
      wabaId: 'wabaId',
      status: 'status',
      displayName: 'displayName',
      qualityRating: 'qualityRating',
      messagingTier: 'messagingTier',
      lastHealthCheckAt: 'lastHealthCheckAt',
    },
  },
  eq: vi.fn((_a: unknown, _b: unknown) => true),
  and: vi.fn((...args: unknown[]) => args),
  sql: vi.fn(),
}));

// Mock connection use case
vi.mock('@leedi/connection', () => ({
  connectWhatsappNumber: vi.fn(),
  InvalidCredentialsError: class InvalidCredentialsError extends Error {
    override readonly name = 'InvalidCredentialsError';
    constructor() {
      super(
        'Credenciais invalidas. Verifique o phone_number_id, waba_id e o token de acesso.'
      );
    }
  },
  MetaCloudProvider: vi.fn(),
}));

const TENANT_ID = '00000000-0000-0000-0000-000000000042';

describe('WhatsApp routes', () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  async function buildApp() {
    const { Hono } = await import('hono');
    const { createWhatsappRouter } = await import('../routes/whatsapp.js');
    const { requestContextMiddleware, errorHandler } = await import(
      '../middleware/request-context.js'
    );
    const app = new Hono();
    app.use('*', requestContextMiddleware);
    app.onError(errorHandler);
    app.route(`/api/tenants/:tenantId/whatsapp`, createWhatsappRouter());
    return app;
  }

  it('POST /connect returns 401 when no session', async () => {
    const { getSession } = await import('@leedi/auth');
    vi.mocked(getSession).mockResolvedValue(null);

    const app = await buildApp();
    const res = await app.request(`/api/tenants/${TENANT_ID}/whatsapp/connect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone_number_id: 'p1', waba_id: 'w1', access_token: 'tok' }),
    });

    expect(res.status).toBe(401);
  });

  it('POST /connect returns 403 for non-owner role', async () => {
    const { getSession } = await import('@leedi/auth');
    const { withUser } = await import('@leedi/db');

    vi.mocked(getSession).mockResolvedValue({
      user: { id: 'user-1', email: 'u@test.com', name: 'User' },
      session: { id: 'sess-1', userId: 'user-1', expiresAt: new Date() },
    } as Awaited<ReturnType<typeof getSession>>);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(withUser).mockImplementation(async (_uid: string, fn: (tx: any) => Promise<unknown>) => {
      return fn({
        select: () => ({
          from: () => ({
            where: () => ({
              limit: async () => [{ role: 'admin' }],
            }),
          }),
        }),
      });
    });

    const app = await buildApp();
    const res = await app.request(`/api/tenants/${TENANT_ID}/whatsapp/connect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone_number_id: 'p1', waba_id: 'w1', access_token: 'tok' }),
    });

    expect(res.status).toBe(403);
  });

  it('POST /connect returns 400 with exact pt-BR message on invalid credentials', async () => {
    const { getSession } = await import('@leedi/auth');
    const { withUser } = await import('@leedi/db');
    const connection = await import('@leedi/connection');
    const { InvalidCredentialsError } = connection;

    vi.mocked(getSession).mockResolvedValue({
      user: { id: 'user-1', email: 'u@test.com', name: 'User' },
      session: { id: 'sess-1', userId: 'user-1', expiresAt: new Date() },
    } as Awaited<ReturnType<typeof getSession>>);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(withUser).mockImplementation(async (_uid: string, fn: (tx: any) => Promise<unknown>) => {
      return fn({
        select: () => ({
          from: () => ({
            where: () => ({
              limit: async () => [{ role: 'owner' }],
            }),
          }),
        }),
      });
    });

    vi.mocked(connection.connectWhatsappNumber).mockRejectedValue(new InvalidCredentialsError());

    const app = await buildApp();
    const res = await app.request(`/api/tenants/${TENANT_ID}/whatsapp/connect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone_number_id: 'p1', waba_id: 'w1', access_token: 'bad' }),
    });

    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toBe(
      'Credenciais invalidas. Verifique o phone_number_id, waba_id e o token de acesso.'
    );
  });

  it('POST /connect returns 200 with token-free body on success', async () => {
    const { getSession } = await import('@leedi/auth');
    const { withUser } = await import('@leedi/db');
    const connection = await import('@leedi/connection');

    vi.mocked(getSession).mockResolvedValue({
      user: { id: 'user-1', email: 'u@test.com', name: 'User' },
      session: { id: 'sess-1', userId: 'user-1', expiresAt: new Date() },
    } as Awaited<ReturnType<typeof getSession>>);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(withUser).mockImplementation(async (_uid: string, fn: (tx: any) => Promise<unknown>) => {
      return fn({
        select: () => ({
          from: () => ({
            where: () => ({
              limit: async () => [{ role: 'owner' }],
            }),
          }),
        }),
      });
    });

    vi.mocked(connection.connectWhatsappNumber).mockResolvedValue({
      status: 'conectado',
      displayName: 'Loja Teste',
      qualityRating: 'GREEN',
      messagingTier: 'TIER_1K',
      phoneNumberId: 'p1',
    });

    const app = await buildApp();
    const res = await app.request(`/api/tenants/${TENANT_ID}/whatsapp/connect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone_number_id: 'p1', waba_id: 'w1', access_token: 'my-secret' }),
    });

    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body['status']).toBe('conectado');
    expect(body['displayName']).toBe('Loja Teste');
    expect(body['phoneNumberId']).toBe('p1');
    expect(JSON.stringify(body)).not.toContain('my-secret');
  });
});
