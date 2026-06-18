import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';

const WEBHOOK_TOKEN = 'test-webhook-token';

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('@leedi/config', () => ({
  env: {
    ASAAS_API_KEY: 'test-key',
    ASAAS_SANDBOX: true,
    ASAAS_WEBHOOK_TOKEN: WEBHOOK_TOKEN,
    UPSTASH_REDIS_REST_URL: 'https://redis.example.com',
    UPSTASH_REDIS_REST_TOKEN: 'redis-token',
    QSTASH_TOKEN: 'qstash-token',
    BETTER_AUTH_URL: 'http://localhost:3000',
    API_PORT: 3003,
  },
}));

const redisMock = { set: vi.fn(), del: vi.fn() };
vi.mock('@upstash/redis', () => ({
  Redis: vi.fn(function RedisMock() { return redisMock; }),
}));

const qstashMock = { publishJSON: vi.fn() };
vi.mock('@upstash/qstash', () => ({
  Client: vi.fn(function ClientMock() { return qstashMock; }),
}));

// Mock AsaasProvider — verificarWebhook now compares the incoming token string
// (read from the `asaas-access-token` header) against the expected token.
vi.mock('@leedi/billing', () => ({
  AsaasProvider: vi.fn(function AsaasProviderMock(
    this: { verificarWebhook: (incoming: string | undefined | null, expected: string) => boolean }
  ) {
    this.verificarWebhook = (incoming: string | undefined | null, expected: string) =>
      typeof incoming === 'string' && incoming.length > 0 && incoming === expected;
  }),
}));

// ─── App setup ────────────────────────────────────────────────────────────────

const VALID_BODY = JSON.stringify({ event: 'PAYMENT_RECEIVED', payment: { id: 'pay-001' } });

let app: Hono;
beforeEach(async () => {
  vi.clearAllMocks();
  redisMock.set.mockResolvedValue('OK');
  redisMock.del.mockResolvedValue(1);
  qstashMock.publishJSON.mockResolvedValue({});

  const { createAsaasWebhookRouter } = await import('../asaas.js');
  app = new Hono();
  app.route('/webhooks/asaas', createAsaasWebhookRouter());
});

function post(body: string, headers: Record<string, string> = {}) {
  return app.request('/webhooks/asaas', {
    method: 'POST',
    body,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('POST /webhooks/asaas', () => {
  it('returns 401 when the asaas-access-token header is missing entirely', async () => {
    const res = await post(VALID_BODY);
    expect(res.status).toBe(401);
    expect(qstashMock.publishJSON).not.toHaveBeenCalled();
  });

  it('returns 401 when the asaas-access-token header is wrong', async () => {
    const res = await post(VALID_BODY, { 'asaas-access-token': 'wrong-token' });
    expect(res.status).toBe(401);
    expect(qstashMock.publishJSON).not.toHaveBeenCalled();
  });

  it('returns 200 and enqueues when the asaas-access-token header is correct', async () => {
    const res = await post(VALID_BODY, { 'asaas-access-token': WEBHOOK_TOKEN });
    expect(res.status).toBe(200);
    expect(qstashMock.publishJSON).toHaveBeenCalledOnce();
  });

  it('returns 200 without re-enqueuing on duplicate (Redis NX already set)', async () => {
    redisMock.set.mockResolvedValue(null); // NX failed — key already exists
    const res = await post(VALID_BODY, { 'asaas-access-token': WEBHOOK_TOKEN });
    expect(res.status).toBe(200);
    expect(qstashMock.publishJSON).not.toHaveBeenCalled();
  });

  it('returns 200 without enqueue when payment.id is missing', async () => {
    const res = await post(
      JSON.stringify({ event: 'PAYMENT_RECEIVED' }),
      { 'asaas-access-token': WEBHOOK_TOKEN }
    );
    expect(res.status).toBe(200);
    expect(qstashMock.publishJSON).not.toHaveBeenCalled();
    expect(redisMock.set).not.toHaveBeenCalled();
  });

  it('releases the dedup key and returns 500 when the QStash enqueue fails (so Asaas retries)', async () => {
    qstashMock.publishJSON.mockRejectedValue(new Error('QStash down'));
    const res = await post(VALID_BODY, { 'asaas-access-token': WEBHOOK_TOKEN });
    expect(res.status).toBe(500);
    // Dedup key must be released so the retried webhook is reprocessed (no lost payment).
    expect(redisMock.del).toHaveBeenCalledWith('webhook:asaas:pay-001:PAYMENT_RECEIVED');
  });

  it('scopes the dedup key by (paymentId + event) so distinct events for the same payment both enqueue (F-38)', async () => {
    // PIX/card: PAYMENT_CREATED then PAYMENT_RECEIVED for the SAME payment, seconds
    // apart. A payment-id-only key would drop the RECEIVED; the event-scoped key
    // lets each through (distinct NX keys).
    await post(
      JSON.stringify({ event: 'PAYMENT_CREATED', payment: { id: 'pay-001' } }),
      { 'asaas-access-token': WEBHOOK_TOKEN }
    );
    await post(
      JSON.stringify({ event: 'PAYMENT_RECEIVED', payment: { id: 'pay-001' } }),
      { 'asaas-access-token': WEBHOOK_TOKEN }
    );
    expect(redisMock.set).toHaveBeenNthCalledWith(1, 'webhook:asaas:pay-001:PAYMENT_CREATED', '1', expect.anything());
    expect(redisMock.set).toHaveBeenNthCalledWith(2, 'webhook:asaas:pay-001:PAYMENT_RECEIVED', '1', expect.anything());
    expect(qstashMock.publishJSON).toHaveBeenCalledTimes(2);
  });
});
