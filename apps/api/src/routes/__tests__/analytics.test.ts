import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';

const TENANT_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const USER_ID = 'user-1';

// ─── Proxy-based chainable select mock ───────────────────────────────────────

let dbRows: unknown[][] = [];

function shiftRow(): unknown[] {
  return dbRows.shift() ?? [];
}

function makeSelectChain() {
  const chain: Record<string, unknown> = {
    limit: () => Promise.resolve(shiftRow()),
  };
  const proxy: Record<string, unknown> = new Proxy(chain, {
    get(target, prop) {
      if (prop === 'limit') return target['limit'];
      if (prop === 'then') return undefined;
      return () => proxy;
    },
  });
  return proxy;
}

function makeTx() {
  return {
    select: () => makeSelectChain(),
    execute: vi.fn().mockResolvedValue([]),
  };
}

// ─── Module mocks ─────────────────────────────────────────────────────────────

vi.mock('@leedi/config', () => ({
  env: {
    DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
    NODE_ENV: 'development' as const,
    API_PORT: 3003,
    UPSTASH_REDIS_REST_URL: 'https://test.upstash.io',
    UPSTASH_REDIS_REST_TOKEN: 'test_token',
    BETTER_AUTH_SECRET: 'supersecretkey_at_least_32_chars_long!!',
    BETTER_AUTH_URL: 'http://localhost:3000',
    DASHBOARD_URL: 'http://localhost:3001',
    RESEND_API_KEY: 'test_resend',
    WORKSPACE_ID: '00000000-0000-0000-0000-000000000001',
    ANTHROPIC_API_KEY: 'test_anthropic',
    ENCRYPTION_MASTER_KEY: Buffer.alloc(32, 0xab).toString('base64'),
    WHATSAPP_API_VERSION: 'v20.0',
  },
}));

vi.mock('@leedi/observability', () => ({
  runWithContext: vi.fn((_ctx: unknown, fn: () => unknown) => fn()),
  getContext: vi.fn(() => ({ request_id: 'test-req-id' })),
  captureException: vi.fn(),
}));

vi.mock('@leedi/auth', () => ({
  getSession: vi.fn(),
}));

vi.mock('@upstash/ratelimit', () => ({
  Ratelimit: class {
    limit = vi.fn().mockResolvedValue({ success: true });
    static slidingWindow = () => 'sw';
  },
}));

vi.mock('@upstash/redis', () => ({
  Redis: class {
    get = vi.fn();
    set = vi.fn().mockResolvedValue('OK');
  },
}));

vi.mock('@leedi/analytics', () => ({
  getTenantSalesMetrics: vi.fn().mockResolvedValue({
    conversas_iniciadas: 10,
    taxa_resposta: 0.6,
    conversoes: 3,
    valor_total: 1500,
    ticket_medio: 500,
    roi_estimado: 150,
  }),
  getTopObjections: vi.fn().mockResolvedValue({
    items: [{ label: 'Preço', count: 5, recentWindowIds: [] }],
    total: 1,
  }),
}));

vi.mock('@leedi/db', () => ({
  withTenant: vi.fn((_: string, fn: (tx: ReturnType<typeof makeTx>) => unknown) => fn(makeTx())),
  withUser: vi.fn((_: string, fn: (tx: ReturnType<typeof makeTx>) => unknown) => fn(makeTx())),
  schema: {
    whatsappConnections: {},
    campaigns: {},
    products: {},
    memberships: { userId: 'm.user_id', tenantId: 'm.tenant_id', role: 'm.role' },
  },
  eq: vi.fn(),
  and: vi.fn(),
  desc: vi.fn(),
  sql: vi.fn(),
  gte: vi.fn(),
  lte: vi.fn(),
  isNull: vi.fn(),
  asc: vi.fn(),
  or: vi.fn(),
  inArray: vi.fn(),
}));

// ─── Imports (after mocks) ─────────────────────────────────────────────────────

import { getSession } from '@leedi/auth';
import { createAnalyticsRouter, parseDateRange } from '../analytics.js';

const mockGetSession = vi.mocked(getSession);

function buildApp() {
  const app = new Hono();
  app.route('/api/tenants/:tenantId/analytics', createAnalyticsRouter());
  return app;
}

const VALID_SESSION = {
  user: { id: USER_ID, name: 'Test', email: 'test@test.com' },
  session: { id: 'sess-1', userId: USER_ID, expiresAt: new Date(Date.now() + 86400000) },
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('GET /api/tenants/:tenantId/analytics/sales', () => {
  beforeEach(() => {
    dbRows = [];
    vi.clearAllMocks();
    mockGetSession.mockResolvedValue(VALID_SESSION as never);
  });

  it('returns metrics for valid date range', async () => {
    // membership row for requireTenantSession
    dbRows = [[{ role: 'owner' }]];
    const app = buildApp();
    const res = await app.request(
      `/api/tenants/${TENANT_ID}/analytics/sales?from=2026-05-01&to=2026-05-31`
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { conversas_iniciadas: number };
    expect(body.conversas_iniciadas).toBe(10);
  });

  it('returns 400 for date range > 366 days', async () => {
    dbRows = [[{ role: 'owner' }]];
    const app = buildApp();
    const res = await app.request(
      `/api/tenants/${TENANT_ID}/analytics/sales?from=2024-01-01&to=2026-12-31`
    );
    expect(res.status).toBe(400);
  });

  it('returns 400 for an inverted date range (from > to)', async () => {
    dbRows = [[{ role: 'owner' }]];
    const app = buildApp();
    const res = await app.request(
      `/api/tenants/${TENANT_ID}/analytics/sales?from=2026-05-31&to=2026-05-01`
    );
    expect(res.status).toBe(400);
  });
});

describe('parseDateRange', () => {
  it('accepts a valid range', () => {
    expect(parseDateRange('2026-05-01', '2026-05-31')).not.toBeNull();
  });

  it('rejects a range longer than 366 days', () => {
    expect(parseDateRange('2024-01-01', '2026-12-31')).toBeNull();
  });

  it('rejects an inverted range (from > to)', () => {
    expect(parseDateRange('2026-05-31', '2026-05-01')).toBeNull();
  });

  it('rejects a malformed date', () => {
    expect(parseDateRange('not-a-date', '2026-05-01')).toBeNull();
  });

  it('includes the full final day for a date-only `to`', () => {
    const range = parseDateRange('2026-05-01', '2026-05-31');
    expect(range?.to.toISOString()).toBe('2026-05-31T23:59:59.999Z');
  });
});

describe('GET /api/tenants/:tenantId/analytics/connection-health', () => {
  beforeEach(() => {
    dbRows = [];
    vi.clearAllMocks();
    mockGetSession.mockResolvedValue(VALID_SESSION as never);
  });

  it('returns null when no connected WhatsApp', async () => {
    // membership + empty connection result
    dbRows = [[{ role: 'owner' }], []];
    const app = buildApp();
    const res = await app.request(
      `/api/tenants/${TENANT_ID}/analytics/connection-health`
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toBeNull();
  });

  it('returns connection data when connected', async () => {
    dbRows = [
      [{ role: 'owner' }],
      [{ status: 'conectado', qualityRating: 'verde', messagingTier: '10k', displayName: 'Test' }],
    ];
    const app = buildApp();
    const res = await app.request(
      `/api/tenants/${TENANT_ID}/analytics/connection-health`
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string };
    expect(body.status).toBe('conectado');
  });
});

describe('GET /api/tenants/:tenantId/analytics/active-campaign', () => {
  beforeEach(() => {
    dbRows = [];
    vi.clearAllMocks();
    mockGetSession.mockResolvedValue(VALID_SESSION as never);
  });

  it('returns null when no active campaigns', async () => {
    dbRows = [[{ role: 'owner' }], []];
    const app = buildApp();
    const res = await app.request(
      `/api/tenants/${TENANT_ID}/analytics/active-campaign`
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toBeNull();
  });

  it('returns most recent campaign when multiple exist', async () => {
    dbRows = [
      [{ role: 'owner' }],
      [
        {
          id: 'camp-1',
          nome: 'Campanha Recente',
          fase: 'carrinho_aberto',
          dataFim: new Date('2026-12-31'),
          totalAtivas: 2,
          productNome: 'Produto X',
          productTipo: 'principal',
        },
      ],
    ];
    const app = buildApp();
    const res = await app.request(
      `/api/tenants/${TENANT_ID}/analytics/active-campaign`
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { nome: string; totalAtivas: number };
    expect(body.nome).toBe('Campanha Recente');
    expect(body.totalAtivas).toBe(2);
  });
});
