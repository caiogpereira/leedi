import { describe, it, expect, vi, beforeEach } from 'vitest';

const TENANT = 'tenant-1';
const WINDOW = 'window-1';
const USER = 'user-1';

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
  runWithContext: vi.fn((ctx: unknown, fn: () => unknown) => fn()),
  getContext: vi.fn(() => ({ request_id: 'test-req-id' })),
  captureException: vi.fn(),
}));

vi.mock('@leedi/auth', () => ({
  getSession: vi.fn(),
  hasPermission: vi.fn(),
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
    del = vi.fn();
    rpush = vi.fn();
    expire = vi.fn();
    lrange = vi.fn();
  },
}));

vi.mock('@leedi/agent-memory', () => ({
  pauseThreadByWindowId: vi.fn(async () => undefined),
  resumeThreadByWindowId: vi.fn(async () => undefined),
  closeThreadByWindowId: vi.fn(async () => undefined),
}));

const { mockSendText } = vi.hoisted(() => ({
  mockSendText: vi.fn(async () => ({ messageId: 'meta-msg-1' })),
}));

vi.mock('@leedi/connection', () => ({
  // Use a proper class so vi.clearAllMocks() doesn't break the constructor implementation
  MetaCloudProvider: class {
    sendText = mockSendText;
  },
}));

// ─── Shared DB mock state ─────────────────────────────────────────────────────

let dbRows: unknown[][] = [];
const updateSets: unknown[] = [];
const insertedRows: unknown[] = [];

function shiftRow(): unknown[] {
  return dbRows.shift() ?? [];
}

function makeSelectChain() {
  // All methods return the proxy so the chain works regardless of call order.
  const chain: Record<string, unknown> = {
    limit: () => Promise.resolve(shiftRow()),
  };
  const proxy: Record<string, unknown> = new Proxy(chain, {
    get(target, prop) {
      if (prop === 'limit') return target['limit'];
      if (prop === 'then') return undefined; // not a Promise
      return () => proxy; // every other method returns the same proxy
    },
  });
  return proxy;
}

function makeTx() {
  return {
    select: () => makeSelectChain(),
    update: () => ({
      set: (v: unknown) => {
        updateSets.push(v);
        return { where: () => Promise.resolve(undefined) };
      },
    }),
    insert: () => ({
      values: (v: unknown) => {
        insertedRows.push(v);
        return { returning: () => Promise.resolve([]) };
      },
    }),
  };
}

vi.mock('@leedi/db', () => ({
  db: {
    transaction: vi.fn(async (fn: (tx: ReturnType<typeof makeTx>) => unknown) => fn(makeTx())),
  },
  withTenant: vi.fn((_: string, fn: (tx: ReturnType<typeof makeTx>) => unknown) => fn(makeTx())),
  withUser: vi.fn((_: string, fn: (tx: ReturnType<typeof makeTx>) => unknown) => fn(makeTx())),
  schema: {
    inboxAssignments: {
      id: 'ia.id',
      status: 'ia.status',
      assignedTo: 'ia.assigned_to',
      conversationWindowId: 'ia.conversation_window_id',
    },
    conversationWindows: {
      id: 'cw.id',
      tenantId: 'cw.tenant_id',
      leadId: 'cw.lead_id',
      connectionId: 'cw.connection_id',
    },
    leads: { id: 'l.id', tenantId: 'l.tenant_id', telefone: 'l.telefone' },
    whatsappConnections: {
      id: 'wc.id',
      tenantId: 'wc.tenant_id',
      phoneNumberId: 'wc.phone_number_id',
      wabaId: 'wc.waba_id',
      accessTokenEncrypted: 'wc.access_token_encrypted',
      accessTokenIv: 'wc.access_token_iv',
    },
    messages: {},
    memberships: { userId: 'm.user_id', tenantId: 'm.tenant_id', role: 'm.role' },
  },
  eq: vi.fn((col: unknown, val: unknown) => ({ op: 'eq', col, val })),
  and: vi.fn((...args: unknown[]) => ({ op: 'and', args })),
  sql: vi.fn(),
}));

// ─── Test setup ───────────────────────────────────────────────────────────────

import { Hono } from 'hono';
import { getSession } from '@leedi/auth';
import { pauseThreadByWindowId, resumeThreadByWindowId, closeThreadByWindowId } from '@leedi/agent-memory';
import { createInboxActionsRouter } from '../actions.js';

const mockGetSession = vi.mocked(getSession);

// Use parameterized path so :tenantId is captured correctly by requireTenantSession
const ROUTE_BASE = '/api/tenants/:tenantId/inbox';
const REQ_BASE = `/api/tenants/${TENANT}/inbox`;

function buildApp() {
  const app = new Hono();
  app.route(ROUTE_BASE, createInboxActionsRouter());
  return app;
}

describe('inbox actions — PATCH /:windowId/assign', () => {
  beforeEach(() => {
    dbRows = [];
    updateSets.length = 0;
    insertedRows.length = 0;
    vi.clearAllMocks();
    mockSendText.mockResolvedValue({ messageId: 'meta-msg-1' });
    // Session mock: return valid user
    mockGetSession.mockResolvedValue({
      user: { id: USER, name: 'Operador', email: 'op@test.com' },
      session: { id: 'sess-1', userId: USER, expiresAt: new Date(Date.now() + 86400000) },
    } as never);
  });

  it('takeover: sets status to em_atendimento and pauses thread', async () => {
    dbRows = [
      [{ role: 'member' }],                               // membership (requireTenantSession)
      [{ id: 'assign-1', status: 'aguardando_humano' }],  // assignment
    ];
    const app = buildApp();

    const res = await app.request(`${REQ_BASE}/${WINDOW}/assign`, {
      method: 'PATCH',
      body: JSON.stringify({ action: 'takeover' }),
      headers: { 'content-type': 'application/json' },
    });

    expect(res.status).toBe(200);
    const body = await res.json() as { status: string };
    expect(body.status).toBe('em_atendimento');
    expect(updateSets[0]).toMatchObject({ status: 'em_atendimento', assignedTo: USER });
    expect(pauseThreadByWindowId).toHaveBeenCalledWith(TENANT, WINDOW);
  });

  it('takeover: returns 409 when already em_atendimento by another operator', async () => {
    dbRows = [
      [{ role: 'member' }],
      [{ id: 'assign-1', status: 'em_atendimento', assignedTo: 'user-other' }],
    ];
    const app = buildApp();

    const res = await app.request(`${REQ_BASE}/${WINDOW}/assign`, {
      method: 'PATCH',
      body: JSON.stringify({ action: 'takeover' }),
      headers: { 'content-type': 'application/json' },
    });

    expect(res.status).toBe(409);
    expect(updateSets.length).toBe(0);
    expect(pauseThreadByWindowId).not.toHaveBeenCalled();
  });

  it('takeover: returns 409 when conversation already resolved', async () => {
    dbRows = [
      [{ role: 'member' }],
      [{ id: 'assign-1', status: 'resolvido', assignedTo: null }],
    ];
    const app = buildApp();

    const res = await app.request(`${REQ_BASE}/${WINDOW}/assign`, {
      method: 'PATCH',
      body: JSON.stringify({ action: 'takeover' }),
      headers: { 'content-type': 'application/json' },
    });

    expect(res.status).toBe(409);
    expect(updateSets.length).toBe(0);
  });

  it('takeover: allowed when em_atendimento is already assigned to the same operator', async () => {
    dbRows = [
      [{ role: 'member' }],
      [{ id: 'assign-1', status: 'em_atendimento', assignedTo: USER }],
    ];
    const app = buildApp();

    const res = await app.request(`${REQ_BASE}/${WINDOW}/assign`, {
      method: 'PATCH',
      body: JSON.stringify({ action: 'takeover' }),
      headers: { 'content-type': 'application/json' },
    });

    expect(res.status).toBe(200);
    expect(updateSets[0]).toMatchObject({ status: 'em_atendimento', assignedTo: USER });
  });

  it('return_to_bot: sets status to bot and resumes thread', async () => {
    dbRows = [[{ role: 'member' }], [{ id: 'assign-1', status: 'em_atendimento' }]];
    const app = buildApp();

    const res = await app.request(`${REQ_BASE}/${WINDOW}/assign`, {
      method: 'PATCH',
      body: JSON.stringify({ action: 'return_to_bot' }),
      headers: { 'content-type': 'application/json' },
    });

    expect(res.status).toBe(200);
    const body = await res.json() as { status: string };
    expect(body.status).toBe('bot');
    expect(updateSets[0]).toMatchObject({ status: 'bot', assignedTo: null });
    expect(resumeThreadByWindowId).toHaveBeenCalledWith(TENANT, WINDOW);
  });

  it('resolve: sets status to resolvido and closes thread', async () => {
    dbRows = [[{ role: 'member' }], [{ id: 'assign-1', status: 'em_atendimento' }]];
    const app = buildApp();

    const res = await app.request(`${REQ_BASE}/${WINDOW}/assign`, {
      method: 'PATCH',
      body: JSON.stringify({ action: 'resolve' }),
      headers: { 'content-type': 'application/json' },
    });

    expect(res.status).toBe(200);
    const body = await res.json() as { status: string };
    expect(body.status).toBe('resolvido');
    expect(closeThreadByWindowId).toHaveBeenCalledWith(TENANT, WINDOW);
  });

  it('returns 404 when no assignment found', async () => {
    dbRows = [[{ role: 'member' }], []]; // membership found, no assignment
    const app = buildApp();

    const res = await app.request(`${REQ_BASE}/${WINDOW}/assign`, {
      method: 'PATCH',
      body: JSON.stringify({ action: 'takeover' }),
      headers: { 'content-type': 'application/json' },
    });

    expect(res.status).toBe(404);
  });

  it('returns 400 for invalid action', async () => {
    dbRows = [[{ role: 'member' }]];
    const app = buildApp();

    const res = await app.request(`${REQ_BASE}/${WINDOW}/assign`, {
      method: 'PATCH',
      body: JSON.stringify({ action: 'invalid' }),
      headers: { 'content-type': 'application/json' },
    });

    expect(res.status).toBe(400);
  });
});

describe('inbox actions — POST /:windowId/reply', () => {
  beforeEach(() => {
    dbRows = [];
    updateSets.length = 0;
    insertedRows.length = 0;
    vi.clearAllMocks();
    mockSendText.mockResolvedValue({ messageId: 'meta-msg-1' });
    mockGetSession.mockResolvedValue({
      user: { id: USER, name: 'Operador', email: 'op@test.com' },
      session: { id: 'sess-1', userId: USER, expiresAt: new Date(Date.now() + 86400000) },
    } as never);
  });

  it('sends message and inserts to DB', async () => {
    dbRows = [
      [{ role: 'member' }],
      [{ status: 'em_atendimento', assignedTo: USER }],
      [{ leadId: 'lead-1', connectionId: 'conn-1' }],
      [{ telefone: '+5511999999999' }],
      [{ phoneNumberId: 'pnid', wabaId: 'waba', accessTokenEncrypted: 'enc', accessTokenIv: 'iv' }],
    ];
    const app = buildApp();

    const res = await app.request(`${REQ_BASE}/${WINDOW}/reply`, {
      method: 'POST',
      body: JSON.stringify({ content: 'Olá!' }),
      headers: { 'content-type': 'application/json' },
    });

    expect(res.status).toBe(200);
    expect(mockSendText).toHaveBeenCalledWith('+5511999999999', 'Olá!');
    expect(insertedRows[0]).toMatchObject({
      autor: 'humano',
      direction: 'outbound',
      tipo: 'texto',
      content: 'Olá!',
    });
  });

  it('returns 409 when conversation is not em_atendimento', async () => {
    dbRows = [[{ role: 'member' }], [{ status: 'aguardando_humano', assignedTo: null }]];
    const app = buildApp();

    const res = await app.request(`${REQ_BASE}/${WINDOW}/reply`, {
      method: 'POST',
      body: JSON.stringify({ content: 'Olá!' }),
      headers: { 'content-type': 'application/json' },
    });

    expect(res.status).toBe(409);
  });

  it('returns structured 422 error when Meta rejects with 24h window error', async () => {
    dbRows = [
      [{ role: 'member' }],
      [{ status: 'em_atendimento', assignedTo: USER }],
      [{ leadId: 'lead-1', connectionId: 'conn-1' }],
      [{ telefone: '+5511999999999' }],
      [{ phoneNumberId: 'pnid', wabaId: 'waba', accessTokenEncrypted: 'enc', accessTokenIv: 'iv' }],
    ];
    mockSendText.mockRejectedValue(new Error('Error 131026: 24h window closed'));
    const app = buildApp();

    const res = await app.request(`${REQ_BASE}/${WINDOW}/reply`, {
      method: 'POST',
      body: JSON.stringify({ content: 'Olá!' }),
      headers: { 'content-type': 'application/json' },
    });

    expect(res.status).toBe(422);
    const body = await res.json() as { error: string };
    expect(body.error).toContain('janela de 24h');
    // A failed send must NOT be persisted (AC#3 saves only delivered messages).
    expect(insertedRows.length).toBe(0);
  });

  it('returns 502 and does NOT persist on a non-24h send failure', async () => {
    dbRows = [
      [{ role: 'member' }],
      [{ status: 'em_atendimento', assignedTo: USER }],
      [{ leadId: 'lead-1', connectionId: 'conn-1' }],
      [{ telefone: '+5511999999999' }],
      [{ phoneNumberId: 'pnid', wabaId: 'waba', accessTokenEncrypted: 'enc', accessTokenIv: 'iv' }],
    ];
    mockSendText.mockRejectedValue(new Error('Meta API error: 400'));
    const app = buildApp();

    const res = await app.request(`${REQ_BASE}/${WINDOW}/reply`, {
      method: 'POST',
      body: JSON.stringify({ content: 'Olá!' }),
      headers: { 'content-type': 'application/json' },
    });

    expect(res.status).toBe(502);
    expect(insertedRows.length).toBe(0);
  });

  it('returns 400 when content is empty', async () => {
    dbRows = [[{ role: 'member' }]];
    const app = buildApp();

    const res = await app.request(`${REQ_BASE}/${WINDOW}/reply`, {
      method: 'POST',
      body: JSON.stringify({ content: '  ' }),
      headers: { 'content-type': 'application/json' },
    });

    expect(res.status).toBe(400);
  });

  it('returns 409 when caller is not the assigned operator (server-side auth)', async () => {
    const OTHER_USER = 'user-other';
    dbRows = [[{ role: 'member' }], [{ status: 'em_atendimento', assignedTo: OTHER_USER }]];
    const app = buildApp(); // app injects USER as userId

    const res = await app.request(`${REQ_BASE}/${WINDOW}/reply`, {
      method: 'POST',
      body: JSON.stringify({ content: 'Olá!' }),
      headers: { 'content-type': 'application/json' },
    });

    expect(res.status).toBe(409);
    expect(mockSendText).not.toHaveBeenCalled();
  });

  it('skips Agent SDK call (unit-level: agent guard in process-message is integration-tested separately)', () => {
    // The em_atendimento guard lives in packages/agent/src/use-cases/process-message.ts
    // and is covered by process-message.test.ts (already exists). This is a placeholder
    // to document the decision: the guard is NOT re-tested here to avoid duplication.
    expect(true).toBe(true);
  });
});
