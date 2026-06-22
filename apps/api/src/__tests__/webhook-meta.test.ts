import { describe, expect, it, vi, afterEach } from 'vitest';
import { createHmac } from 'node:crypto';

const APP_SECRET = 'test-app-secret-for-webhook';
const VERIFY_TOKEN = 'leedi-webhook-verify-dev';
const TEST_KEY = Buffer.alloc(32, 0xab).toString('base64');

vi.mock('@leedi/config', () => ({
  env: {
    DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
    NODE_ENV: 'development' as const,
    SENTRY_DSN: 'https://test@sentry.io/1',
    POSTHOG_KEY: 'phc_test',
    BETTER_STACK_TOKEN: 'test',
    API_PORT: 3003,
    UPSTASH_REDIS_REST_URL: 'https://test.upstash.io',
    UPSTASH_REDIS_REST_TOKEN: 'test_token',
    BETTER_AUTH_SECRET: 'supersecretkey_at_least_32_chars_long!!',
    BETTER_AUTH_URL: 'http://localhost:3000',
    DASHBOARD_URL: 'http://localhost:3001',
    RESEND_API_KEY: 're_test',
    WORKSPACE_ID: '00000000-0000-0000-0000-000000000001',
    ANTHROPIC_API_KEY: 'test',
    ENCRYPTION_MASTER_KEY: TEST_KEY,
    WHATSAPP_API_VERSION: 'v20.0',
    WHATSAPP_APP_SECRET: APP_SECRET,
    WHATSAPP_WEBHOOK_VERIFY_TOKEN: VERIFY_TOKEN,
    QSTASH_TOKEN: 'qstash-test',
    QSTASH_CURRENT_SIGNING_KEY: 'sig-current',
    QSTASH_NEXT_SIGNING_KEY: 'sig-next',
  },
}));

vi.mock('@leedi/observability', () => ({
  runWithContext: vi.fn((_ctx: unknown, fn: () => unknown) => fn()),
  getContext: vi.fn(() => ({ request_id: 'test-req-id' })),
  captureException: vi.fn(),
  initSentry: vi.fn(),
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// We do NOT mock Redis/QStash constructors — instead we inject fake deps via createWebhookMetaRouter(deps)
vi.mock('@upstash/qstash', () => {
  class Receiver { verify = vi.fn().mockResolvedValue(true); }
  class Client { publishJSON = vi.fn().mockResolvedValue({ messageId: 'q1' }); }
  return { Receiver, Client };
});

vi.mock('@leedi/db', () => ({
  withServiceRole: vi.fn((_fn: unknown) => Promise.resolve([])),
  withTenant: vi.fn(),
  schema: { whatsappConnections: { phoneNumberId: 'phoneNumberId', tenantId: 'tenantId' }, messages: {} },
  eq: vi.fn(),
}));

vi.mock('@leedi/messaging', () => ({
  resolveConversationWindow: vi
    .fn()
    .mockResolvedValue({ id: 'win-1', startedAt: new Date(), messageCount: 1, billable: true }),
  saveMessage: vi.fn().mockResolvedValue('msg-id-1'),
  hasOpenConversationWindow: vi.fn().mockResolvedValue(false),
}));

vi.mock('@leedi/lead', () => ({
  findOrCreateLeadByPhone: vi.fn().mockResolvedValue({ id: 'lead-1', telefone: '+5511', isNew: true }),
}));

// Usage metering (Story 16.1/16.3) and notifications (Epic 18) were wired into
// processMessage AFTER this suite was first written; mock them so importing
// webhook-meta does not pull in their real module-load side effects (e.g. webpush
// setVapidDetails) and so the inbound flow does not hit real usage/notification logic.
vi.mock('@leedi/usage', () => ({
  checkUsageBlock: vi.fn().mockResolvedValue({ blocked: false }),
  incrementUsage: vi.fn().mockResolvedValue({ alertsDue: [] }),
}));

vi.mock('@leedi/notification', () => ({
  sendNotificationToTenantRole: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@leedi/auth', () => ({ getSession: vi.fn() }));
vi.mock('@leedi/connection', () => ({
  connectWhatsappNumber: vi.fn(),
  InvalidCredentialsError: class InvalidCredentialsError extends Error {},
  MetaCloudProvider: vi.fn(),
  checkConnectionHealth: vi.fn(),
}));

function buildSignature(body: string): string {
  const sig = createHmac('sha256', APP_SECRET).update(body).digest('hex');
  return `sha256=${sig}`;
}

function fakeDeps() {
  return {
    redis: {
      set: vi.fn().mockResolvedValue('OK'),
      rpush: vi.fn().mockResolvedValue(1),
      expire: vi.fn().mockResolvedValue(1),
      lrange: vi.fn().mockResolvedValue([]),
      del: vi.fn().mockResolvedValue(1),
    },
    qstash: {
      publishJSON: vi.fn().mockResolvedValue({ messageId: 'q1' }),
    },
  };
}

function buildWebhookPayload(phoneNumberId: string, messageId: string, from: string, text: string) {
  return JSON.stringify({
    object: 'whatsapp_business_account',
    entry: [
      {
        id: 'waba-id',
        changes: [
          {
            value: {
              metadata: { phone_number_id: phoneNumberId, display_phone_number: '+55119' },
              messages: [{ id: messageId, from, timestamp: '1234567890', type: 'text', text: { body: text } }],
            },
            field: 'messages',
          },
        ],
      },
    ],
  });
}

describe('GET /webhook/meta — verification handshake', () => {
  afterEach(() => { vi.clearAllMocks(); vi.resetModules(); });

  it('echoes hub.challenge when verify_token matches (AC#5)', async () => {
    const { createWebhookMetaRouter } = await import('../routes/webhook-meta.js');
    const { Hono } = await import('hono');
    const app = new Hono();
    app.route('/webhook/meta', createWebhookMetaRouter(fakeDeps()));

    const res = await app.request(
      `/webhook/meta?hub.mode=subscribe&hub.verify_token=${VERIFY_TOKEN}&hub.challenge=CHALLENGE123`
    );
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('CHALLENGE123');
  });

  it('returns 403 when verify_token is wrong (AC#5)', async () => {
    const { createWebhookMetaRouter } = await import('../routes/webhook-meta.js');
    const { Hono } = await import('hono');
    const app = new Hono();
    app.route('/webhook/meta', createWebhookMetaRouter(fakeDeps()));

    const res = await app.request(
      '/webhook/meta?hub.mode=subscribe&hub.verify_token=WRONG&hub.challenge=CHALLENGE123'
    );
    expect(res.status).toBe(403);
  });
});

describe('POST /webhook/meta — inbound messages', () => {
  afterEach(() => { vi.clearAllMocks(); vi.resetModules(); });

  it('returns 403 for invalid signature (AC#2)', async () => {
    const { createWebhookMetaRouter } = await import('../routes/webhook-meta.js');
    const { Hono } = await import('hono');
    const app = new Hono();
    app.route('/webhook/meta', createWebhookMetaRouter(fakeDeps()));

    const body = buildWebhookPayload('p1', 'msg1', '+5511', 'Olá');
    const res = await app.request('/webhook/meta', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-hub-signature-256': 'sha256=INVALIDSIGNATURE',
      },
      body,
    });
    expect(res.status).toBe(403);
  });

  it('returns 403 when signature header is missing (AC#2)', async () => {
    const { createWebhookMetaRouter } = await import('../routes/webhook-meta.js');
    const { Hono } = await import('hono');
    const app = new Hono();
    app.route('/webhook/meta', createWebhookMetaRouter(fakeDeps()));

    const body = buildWebhookPayload('p1', 'msg1', '+5511', 'Olá');
    const res = await app.request('/webhook/meta', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });
    expect(res.status).toBe(403);
  });

  it('returns 200 immediately for valid signature (AC#1)', async () => {
    const { createWebhookMetaRouter } = await import('../routes/webhook-meta.js');
    const { withServiceRole } = await import('@leedi/db');
    const { Hono } = await import('hono');

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(withServiceRole).mockImplementation(async (fn: (tx: any) => Promise<unknown>) => {
      return fn({
        select: () => ({
          from: () => ({
            where: () => ({ limit: async () => [{ tenantId: 't1', connectionId: 'conn-1' }] }),
          }),
        }),
      });
    });

    const app = new Hono();
    app.route('/webhook/meta', createWebhookMetaRouter(fakeDeps()));

    const body = buildWebhookPayload('p1', 'msg-unique-1', '+5511', 'Olá');
    const signature = buildSignature(body);

    const res = await app.request('/webhook/meta', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-hub-signature-256': signature,
      },
      body,
    });
    expect(res.status).toBe(200);
  });
});

describe('POST /webhook/meta — usage blocking (Story 16.3 AC#2/AC#7)', () => {
  afterEach(() => { vi.clearAllMocks(); vi.resetModules(); });

  async function postInbound(): Promise<void> {
    const { createWebhookMetaRouter } = await import('../routes/webhook-meta.js');
    const { withServiceRole } = await import('@leedi/db');
    const { Hono } = await import('hono');

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(withServiceRole).mockImplementation(async (fn: (tx: any) => Promise<unknown>) =>
      fn({
        select: () => ({
          from: () => ({
            where: () => ({ limit: async () => [{ tenantId: 't1', connectionId: 'conn-1' }] }),
          }),
        }),
      })
    );

    const app = new Hono();
    app.route('/webhook/meta', createWebhookMetaRouter(fakeDeps()));
    const body = buildWebhookPayload('p1', 'msg-usage-block', '+5511', 'Olá');
    const res = await app.request('/webhook/meta', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-hub-signature-256': buildSignature(body) },
      body,
    });
    expect(res.status).toBe(200);
  }

  it('blocks a NEW conversation when over limit and no open window exists (AC#2)', async () => {
    const { checkUsageBlock } = await import('@leedi/usage');
    const { resolveConversationWindow, hasOpenConversationWindow, saveMessage } =
      await import('@leedi/messaging');
    vi.mocked(checkUsageBlock).mockResolvedValue({
      blocked: true,
      conversasUsadas: 500,
      conversasLimite: 500,
    });
    vi.mocked(hasOpenConversationWindow).mockResolvedValue(false);

    await postInbound();

    // hasOpenConversationWindow is consulted; since none is open, the new window
    // is never created and the message is never saved (lead gets no response).
    await vi.waitFor(() => expect(vi.mocked(hasOpenConversationWindow)).toHaveBeenCalled());
    expect(vi.mocked(resolveConversationWindow)).not.toHaveBeenCalled();
    expect(vi.mocked(saveMessage)).not.toHaveBeenCalled();
  });

  it('does NOT block when an open window exists — existing conversation continues (AC#7)', async () => {
    const { checkUsageBlock } = await import('@leedi/usage');
    const { resolveConversationWindow, hasOpenConversationWindow } =
      await import('@leedi/messaging');
    vi.mocked(checkUsageBlock).mockResolvedValue({
      blocked: true,
      conversasUsadas: 500,
      conversasLimite: 500,
    });
    vi.mocked(hasOpenConversationWindow).mockResolvedValue(true);

    await postInbound();

    // Over limit + blocking ON, but the lead is mid-conversation: the window is
    // still resolved (bumped) so the agent keeps responding.
    await vi.waitFor(() => expect(vi.mocked(resolveConversationWindow)).toHaveBeenCalled());
  });
});

describe('POST /webhook/meta — rate limiting (NFR8 / PL-11)', () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    vi.doUnmock('../middleware/rate-limit.js');
  });

  it('returns 429 and skips processing when the per-connection webhook limit is exceeded', async () => {
    // Force the (otherwise test-env-short-circuited) limiter to reject.
    vi.doMock('../middleware/rate-limit.js', () => ({
      webhookLimit: vi.fn().mockResolvedValue({ success: false }),
    }));
    const { createWebhookMetaRouter } = await import('../routes/webhook-meta.js');
    const { Hono } = await import('hono');
    const deps = fakeDeps();
    const app = new Hono();
    app.route('/webhook/meta', createWebhookMetaRouter(deps));

    const body = buildWebhookPayload('p1', 'msg-rl-429', '+5511', 'Olá');
    const res = await app.request('/webhook/meta', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-hub-signature-256': buildSignature(body) },
      body,
    });

    expect(res.status).toBe(429);
    // Throttled BEFORE any async processing is scheduled.
    expect(deps.qstash.publishJSON).not.toHaveBeenCalled();
    expect(deps.redis.rpush).not.toHaveBeenCalled();
  });

  it('passes the signed phone_number_id to the webhook limiter (per-connection key)', async () => {
    const webhookLimit = vi.fn().mockResolvedValue({ success: true });
    vi.doMock('../middleware/rate-limit.js', () => ({ webhookLimit }));
    const { createWebhookMetaRouter } = await import('../routes/webhook-meta.js');
    const { withServiceRole } = await import('@leedi/db');
    const { Hono } = await import('hono');

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(withServiceRole).mockImplementation(async (fn: (tx: any) => Promise<unknown>) =>
      fn({
        select: () => ({
          from: () => ({
            where: () => ({ limit: async () => [{ tenantId: 't1', connectionId: 'conn-1' }] }),
          }),
        }),
      })
    );

    const app = new Hono();
    app.route('/webhook/meta', createWebhookMetaRouter(fakeDeps()));
    const body = buildWebhookPayload('phone-42', 'msg-rl-200', '+5511', 'Olá');
    const res = await app.request('/webhook/meta', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-hub-signature-256': buildSignature(body) },
      body,
    });

    expect(res.status).toBe(200);
    expect(webhookLimit).toHaveBeenCalledWith('phone-42');
  });
});
