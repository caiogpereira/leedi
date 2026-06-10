// Route-level tests for the campaigns lifecycle error→HTTP mapping.
//
// These exercise the REAL use cases + REAL error classes through the router's
// catch blocks (not the use case in isolation) — the layer where review findings
// F1 (encerrada → 409) and F2 (invalid transition → 400, previously 500) lived.
// The handlers `await import()` their use cases; under ESM that resolves to the
// same cached module as the router's top-level static error-class imports, so the
// `instanceof` mapping is what we verify here.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';

// DB rows queue: each `.limit()` on a select chain shifts one batch.
let dbRows: unknown[][] = [];
function shiftRow(): unknown[] {
  return dbRows.shift() ?? [];
}
function makeSelectChain() {
  let proxy: Record<string, unknown>;
  const chain: Record<string, unknown> = { limit: () => Promise.resolve(shiftRow()) };
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
    update: () => makeTx(),
    set: () => makeTx(),
    where: () => makeTx(),
    returning: () => Promise.resolve([]),
  };
}

vi.mock('@leedi/config', () => ({
  env: {
    DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
    NODE_ENV: 'development' as const,
    API_PORT: 3003,
    BETTER_AUTH_URL: 'http://localhost:3000',
    UPSTASH_REDIS_REST_URL: 'https://test.upstash.io',
    UPSTASH_REDIS_REST_TOKEN: 'test_token',
    QSTASH_TOKEN: 'test_qstash',
  },
}));

vi.mock('@leedi/auth', () => ({
  getSession: vi.fn(),
  hasPermission: vi.fn(() => true),
  getWorkspaceAdmin: vi.fn(),
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

vi.mock('@upstash/qstash', () => ({
  Client: class {
    publishJSON = vi.fn().mockResolvedValue({ messageId: 'job-x' });
    messages = { delete: vi.fn().mockResolvedValue(undefined) };
  },
}));

vi.mock('@leedi/db', () => ({
  db: {},
  withTenant: vi.fn((_id: string, fn: (tx: unknown) => unknown) => fn(makeTx())),
  withUser: vi.fn((_id: string, fn: (tx: unknown) => unknown) => fn(makeTx())),
  withServiceRole: vi.fn((fn: (tx: unknown) => unknown) => fn(makeTx())),
  schema: { campaigns: {}, memberships: {}, tenants: {} },
  eq: vi.fn(),
  and: vi.fn((...a: unknown[]) => a),
}));

import { getSession } from '@leedi/auth';
import { createCampaignsRouter } from '../index.js';

const mockGetSession = vi.mocked(getSession);

const TENANT_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const CAMPAIGN_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const VALID_SESSION = {
  user: { id: 'user-1', name: 'Test', email: 'test@test.com' },
  session: { id: 'sess-1', userId: 'user-1', expiresAt: new Date(Date.now() + 86400000) },
};

function buildApp() {
  const app = new Hono();
  app.route('/api/tenants/:tenantId/campaigns', createCampaignsRouter());
  return app;
}

beforeEach(() => {
  dbRows = [];
  vi.clearAllMocks();
  mockGetSession.mockResolvedValue(VALID_SESSION as never);
});

describe('campaigns lifecycle error → HTTP mapping', () => {
  it('F2: invalid phase transition maps to 400 (not 500)', async () => {
    // [membership for requireTenantSession, campaign row for transitionCampaignPhase]
    // fase=downsell has no legal forward transition → InvalidPhaseTransitionError.
    dbRows = [
      [{ role: 'owner' }],
      [{ fase: 'downsell', tipo: 'lancamento', config: {} }],
    ];
    const res = await buildApp().request(
      `/api/tenants/${TENANT_ID}/campaigns/${CAMPAIGN_ID}/transition`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetPhase: 'aquecimento' }),
      }
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toContain('Transição');
  });

  it('F2: perpetuo campaign transition maps to 400', async () => {
    dbRows = [
      [{ role: 'owner' }],
      [{ fase: 'aquecimento', tipo: 'perpetuo', config: {} }],
    ];
    const res = await buildApp().request(
      `/api/tenants/${TENANT_ID}/campaigns/${CAMPAIGN_ID}/transition`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetPhase: 'carrinho_aberto' }),
      }
    );
    expect(res.status).toBe(400);
  });

  it('F1: reactivating an encerrada campaign maps to 409', async () => {
    // [membership, assertNoActiveCampaign (none active), target status=encerrada]
    dbRows = [[{ role: 'owner' }], [], [{ status: 'encerrada' }]];
    const res = await buildApp().request(
      `/api/tenants/${TENANT_ID}/campaigns/${CAMPAIGN_ID}/activate`,
      { method: 'POST' }
    );
    expect(res.status).toBe(409);
  });
});
