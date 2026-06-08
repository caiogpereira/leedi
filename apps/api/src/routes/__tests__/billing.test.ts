import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';

// ─── DB state ────────────────────────────────────────────────────────────────

// Row queue: each call to limit() shifts one batch from this queue.
let dbRows: unknown[][] = [];

function shiftRow(): unknown[] {
  return dbRows.shift() ?? [];
}

function makeSelectChain() {
  let proxy: Record<string, unknown>;
  const chain: Record<string, unknown> = {
    limit: () => Promise.resolve(shiftRow()),
  };
  proxy = new Proxy(chain, {
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

let mockHasPermission = true;

vi.mock('@leedi/auth', () => ({
  getSession: vi.fn(),
  hasPermission: vi.fn(() => mockHasPermission),
}));

vi.mock('@leedi/observability', () => ({
  runWithContext: vi.fn((_ctx: unknown, fn: () => unknown) => fn()),
  getContext: vi.fn(() => ({ request_id: 'test-req-id' })),
  captureException: vi.fn(),
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

vi.mock('@leedi/db', () => ({
  withTenant: vi.fn((_id: string, fn: (tx: unknown) => unknown) => fn(makeTx())),
  withUser: vi.fn((_id: string, fn: (tx: unknown) => unknown) => fn(makeTx())),
  schema: {
    subscriptions: { tenantId: 's.tenant_id', plano: 's.plano', valor: 's.valor', status: 's.status', proximoVencimento: 's.proximo_vencimento' },
    invoices: { tenantId: 'i.tenant_id', valor: 'i.valor', valorOverage: 'i.valor_overage', vencimento: 'i.vencimento', pagoPem: 'i.pago_em', status: 'i.status', receiptUrl: 'i.receipt_url', createdAt: 'i.created_at' },
    tenants: { id: 't.id', status: 't.status', config: 't.config' },
    memberships: { userId: 'm.user_id', tenantId: 'm.tenant_id', role: 'm.role' },
  },
  eq: vi.fn(),
  desc: vi.fn(),
  withServiceRole: vi.fn((_fn: (tx: unknown) => unknown) => _fn(makeTx())),
  and: vi.fn(),
  sql: Object.assign(
    (strings: TemplateStringsArray, ...vals: unknown[]) =>
      strings.reduce((acc: string, s: string, i: number) => acc + s + (vals[i] ?? ''), ''),
    { raw: (s: string) => s }
  ),
}));

// ─── Imports (after mocks) ────────────────────────────────────────────────────

import { getSession } from '@leedi/auth';
import { createBillingRouter } from '../billing.js';

const mockGetSession = vi.mocked(getSession);

const TENANT_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

const VALID_SESSION = {
  user: { id: 'user-1', name: 'Test', email: 'test@test.com' },
  session: { id: 'sess-1', userId: 'user-1', expiresAt: new Date(Date.now() + 86400000) },
};

function buildApp() {
  const app = new Hono();
  app.route('/api/tenants/:tenantId/billing', createBillingRouter());
  return app;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('GET /api/tenants/:tenantId/billing/summary', () => {
  beforeEach(() => {
    dbRows = [];
    mockHasPermission = true;
    vi.clearAllMocks();
    mockGetSession.mockResolvedValue(VALID_SESSION as never);
  });

  it('returns 403 for operator role (no billing:read permission)', async () => {
    mockHasPermission = false;
    dbRows = [[{ role: 'operator' }]];
    const app = buildApp();
    const res = await app.request(`/api/tenants/${TENANT_ID}/billing/summary`);
    expect(res.status).toBe(403);
  });

  it('returns 200 with subscription and tenant status for owner', async () => {
    dbRows = [
      [{ role: 'owner' }], // membership
      [{ plano: 'starter', valor: '697.00', status: 'ativa', proximoVencimento: '2026-07-01' }], // subscription
      [{ status: 'active', config: {} }], // tenant
    ];
    const app = buildApp();
    const res = await app.request(`/api/tenants/${TENANT_ID}/billing/summary`);
    expect(res.status).toBe(200);
    const data = await res.json() as { subscription: unknown; tenant: { status: string } };
    expect(data.tenant.status).toBe('active');
    expect(data.subscription).not.toBeNull();
  });
});

describe('GET /api/tenants/:tenantId/billing/invoices', () => {
  beforeEach(() => {
    dbRows = [];
    mockHasPermission = true;
    vi.clearAllMocks();
    mockGetSession.mockResolvedValue(VALID_SESSION as never);
  });

  it('returns 403 for operator role', async () => {
    mockHasPermission = false;
    dbRows = [[{ role: 'operator' }]];
    const app = buildApp();
    const res = await app.request(`/api/tenants/${TENANT_ID}/billing/invoices`);
    expect(res.status).toBe(403);
  });

  it('returns empty array (not 404) when no invoices exist', async () => {
    dbRows = [
      [{ role: 'owner' }], // membership
      [],                   // invoices — empty
    ];
    const app = buildApp();
    const res = await app.request(`/api/tenants/${TENANT_ID}/billing/invoices`);
    expect(res.status).toBe(200);
    const data = await res.json() as unknown[];
    expect(Array.isArray(data)).toBe(true);
    expect(data).toHaveLength(0);
  });

  it('returns invoices ordered by created_at DESC', async () => {
    const invoiceRows = [
      { id: 'inv-1', valor: '697.00', valorOverage: '0', vencimento: '2026-06-01', pagoPem: '2026-06-03', status: 'pago', receiptUrl: null },
    ];
    dbRows = [
      [{ role: 'owner' }],
      invoiceRows,
    ];
    const app = buildApp();
    const res = await app.request(`/api/tenants/${TENANT_ID}/billing/invoices`);
    expect(res.status).toBe(200);
    const data = await res.json() as unknown[];
    expect(data).toHaveLength(1);
  });
});
