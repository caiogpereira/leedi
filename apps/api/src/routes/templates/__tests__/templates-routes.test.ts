import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';

// ─── DB row queue: each limit() shifts one batch ───────────────────────────────

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

let deleteCalls = 0;

function makeTx() {
  return {
    select: () => makeSelectChain(),
    delete: () => ({ where: () => { deleteCalls++; return Promise.resolve([]); } }),
  };
}

// ─── Module mocks ──────────────────────────────────────────────────────────────

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
    WORKSPACE_ID: '00000000-0000-0000-0000-000000000001',
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

// submit-template.ts imports this at module load; not exercised by these tests.
vi.mock('@leedi/connection', () => ({ MetaCloudProvider: class {} }));

vi.mock('@leedi/db', () => ({
  withTenant: vi.fn((_id: string, fn: (tx: unknown) => unknown) => fn(makeTx())),
  withUser: vi.fn((_id: string, fn: (tx: unknown) => unknown) => fn(makeTx())),
  withServiceRole: vi.fn((fn: (tx: unknown) => unknown) => fn(makeTx())),
  schema: {
    templates: { id: 't.id', tenantId: 't.tenant_id', status: 't.status' },
    templateLibrary: { isGlobal: 'tl.is_global', categoriaOcasiao: 'tl.categoria' },
    memberships: { userId: 'm.user_id', tenantId: 'm.tenant_id', role: 'm.role' },
  },
  eq: vi.fn(),
  and: vi.fn(),
}));

// ─── Imports (after mocks) ─────────────────────────────────────────────────────

import { getSession } from '@leedi/auth';
import { createTemplatesRouter } from '../index.js';

const mockGetSession = vi.mocked(getSession);

const TENANT_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const TEMPLATE_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

const VALID_SESSION = {
  user: { id: 'user-1', name: 'Test', email: 'test@test.com' },
  session: { id: 'sess-1', userId: 'user-1', expiresAt: new Date(Date.now() + 86400000) },
};

function buildApp() {
  const app = new Hono();
  app.route('/api/tenants/:tenantId/templates', createTemplatesRouter());
  return app;
}

beforeEach(() => {
  dbRows = [];
  deleteCalls = 0;
  vi.clearAllMocks();
  mockGetSession.mockResolvedValue(VALID_SESSION as never);
});

describe('GET /templates ?status= validation (AC#7 / enum-injection guard)', () => {
  it('rejects an out-of-enum status with 400 (not a 500 from pg 22P02)', async () => {
    dbRows = [[{ role: 'owner' }]]; // requireTenantSession membership
    const res = await buildApp().request(
      `/api/tenants/${TENANT_ID}/templates?status=not_a_status`
    );
    expect(res.status).toBe(400);
  });
});

describe('DELETE /templates/:id status guard', () => {
  it('returns 404 when the template does not exist', async () => {
    dbRows = [[{ role: 'owner' }], []]; // membership, then no template
    const res = await buildApp().request(`/api/tenants/${TENANT_ID}/templates/${TEMPLATE_ID}`, {
      method: 'DELETE',
    });
    expect(res.status).toBe(404);
    expect(deleteCalls).toBe(0);
  });

  it('returns 400 (not 204) when the template is not a rascunho, and does NOT delete', async () => {
    dbRows = [[{ role: 'owner' }], [{ status: 'aprovado' }]];
    const res = await buildApp().request(`/api/tenants/${TENANT_ID}/templates/${TEMPLATE_ID}`, {
      method: 'DELETE',
    });
    expect(res.status).toBe(400);
    expect(deleteCalls).toBe(0);
  });

  it('returns 204 and deletes when the template is a rascunho', async () => {
    dbRows = [[{ role: 'owner' }], [{ status: 'rascunho' }]];
    const res = await buildApp().request(`/api/tenants/${TENANT_ID}/templates/${TEMPLATE_ID}`, {
      method: 'DELETE',
    });
    expect(res.status).toBe(204);
    expect(deleteCalls).toBe(1);
  });
});
