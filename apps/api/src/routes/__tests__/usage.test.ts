import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';

// ─── State ───────────────────────────────────────────────────────────────────

const state = vi.hoisted(() => ({
  usageCurrentResult: {
    periodo: '2026-06',
    conversasUsadas: 200,
    conversasLimite: 500,
    overageConversas: 0,
    overageValor: '0.00',
    pct: 40,
    blocked: false,
  } as Record<string, unknown> | null,
  historyResult: [] as Record<string, unknown>[],
}));

// DB rows queue: each call to limit() shifts one row batch from this queue.
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
    update: () => makeTx(),
    set: () => makeTx(),
    where: () => makeTx(),
    returning: () => Promise.resolve([{ config: {} }]),
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

vi.mock('@leedi/auth', () => ({
  getSession: vi.fn(),
  hasPermission: vi.fn(() => true),
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
    tenants: { id: 't.id', config: 't.config' },
    usageCounters: {},
    memberships: { userId: 'm.user_id', tenantId: 'm.tenant_id', role: 'm.role' },
  },
  eq: vi.fn(),
  and: vi.fn(),
  desc: vi.fn(),
  sql: Object.assign(
    (strings: TemplateStringsArray, ...vals: unknown[]) =>
      strings.reduce((acc: string, s: string, i: number) => acc + s + (vals[i] ?? ''), ''),
    { raw: (s: string) => s }
  ),
  gte: vi.fn(),
}));

vi.mock('@leedi/usage', () => ({
  getUsageCounter: vi.fn(async () => state.usageCurrentResult),
  getUsageHistory: vi.fn(async () => state.historyResult),
  checkUsageBlock: vi.fn(async () => ({ blocked: false, conversasUsadas: 0, conversasLimite: 500 })),
  incrementUsage: vi.fn(async () => ({ blocked: false, alertsDue: [] })),
}));

// ─── Imports (after mocks) ─────────────────────────────────────────────────────

import { getSession } from '@leedi/auth';
import { getUsageCounter, getUsageHistory } from '@leedi/usage';
import { createUsageRouter } from '../usage.js';

const mockGetSession = vi.mocked(getSession);

const TENANT_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

const VALID_SESSION = {
  user: { id: 'user-1', name: 'Test', email: 'test@test.com' },
  session: { id: 'sess-1', userId: 'user-1', expiresAt: new Date(Date.now() + 86400000) },
};

function buildApp() {
  const app = new Hono();
  app.route('/api/tenants/:tenantId/usage', createUsageRouter());
  return app;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('GET /api/tenants/:tenantId/usage/current', () => {
  beforeEach(() => {
    dbRows = [];
    vi.clearAllMocks();
    mockGetSession.mockResolvedValue(VALID_SESSION as never);
    state.usageCurrentResult = {
      periodo: '2026-06',
      conversasUsadas: 200,
      conversasLimite: 500,
      overageConversas: 0,
      overageValor: '0.00',
      pct: 40,
      blocked: false,
    };
  });

  it('returns 200 with usage counter', async () => {
    dbRows = [[{ role: 'owner' }]]; // membership row for requireTenantSession
    const app = buildApp();
    const res = await app.request(`/api/tenants/${TENANT_ID}/usage/current`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toMatchObject({ pct: 40, conversasUsadas: 200 });
  });

  it('returns 503 when getUsageCounter throws', async () => {
    dbRows = [[{ role: 'owner' }]];
    vi.mocked(getUsageCounter).mockRejectedValueOnce(new Error('db error'));
    const app = buildApp();
    const res = await app.request(`/api/tenants/${TENANT_ID}/usage/current`);
    expect(res.status).toBe(503);
    const data = await res.json();
    expect(data).toHaveProperty('error');
  });
});

describe('GET /api/tenants/:tenantId/usage/history', () => {
  beforeEach(() => {
    dbRows = [];
    vi.clearAllMocks();
    mockGetSession.mockResolvedValue(VALID_SESSION as never);
    state.historyResult = [
      { periodo: '2026-06', conversasUsadas: 200, conversasLimite: 500 },
      { periodo: '2026-05', conversasUsadas: 500, conversasLimite: 500 },
    ];
  });

  it('returns history records', async () => {
    dbRows = [[{ role: 'owner' }]];
    const app = buildApp();
    const res = await app.request(`/api/tenants/${TENANT_ID}/usage/history`);
    expect(res.status).toBe(200);
    const data = await res.json() as unknown[];
    expect(data).toHaveLength(2);
  });

  it('caps limit at 24', async () => {
    dbRows = [[{ role: 'owner' }]];
    const app = buildApp();
    await app.request(`/api/tenants/${TENANT_ID}/usage/history?limit=50`);
    expect(vi.mocked(getUsageHistory)).toHaveBeenCalledWith(TENANT_ID, 24);
  });
});

describe('PATCH /api/tenants/:tenantId/usage/settings', () => {
  beforeEach(() => {
    dbRows = [];
    vi.clearAllMocks();
    mockGetSession.mockResolvedValue(VALID_SESSION as never);
  });

  it('accepts bloquear_ao_atingir_limite toggle and returns 200', async () => {
    dbRows = [[{ role: 'owner' }]]; // membership row
    const app = buildApp();
    const res = await app.request(`/api/tenants/${TENANT_ID}/usage/settings`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bloquear_ao_atingir_limite: true }),
    });
    expect(res.status).toBe(200);
  });

  it('returns 400 when patch body has no valid keys', async () => {
    dbRows = [[{ role: 'owner' }]];
    const app = buildApp();
    const res = await app.request(`/api/tenants/${TENANT_ID}/usage/settings`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });
});
