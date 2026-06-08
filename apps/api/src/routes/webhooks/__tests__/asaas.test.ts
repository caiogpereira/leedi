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

const redisMock = { set: vi.fn() };
vi.mock('@upstash/redis', () => ({
  Redis: vi.fn(function RedisMock() { return redisMock; }),
}));

const qstashMock = { publishJSON: vi.fn() };
vi.mock('@upstash/qstash', () => ({
  Client: vi.fn(function ClientMock() { return qstashMock; }),
}));

// Mock AsaasProvider — must be a function constructor, not an arrow function
vi.mock('@leedi/billing', () => ({
  AsaasProvider: vi.fn(function AsaasProviderMock(
    this: { verificarWebhook: (p: unknown, t: string) => boolean }
  ) {
    this.verificarWebhook = (payload: unknown, token: string) => {
      const p = payload as Record<string, unknown>;
      return p['accessToken'] === token;
    };
  }),
}));

// ─── App setup ────────────────────────────────────────────────────────────────

let app: Hono;
beforeEach(async () => {
  vi.clearAllMocks();
  redisMock.set.mockResolvedValue('OK');
  qstashMock.publishJSON.mockResolvedValue({});

  const { createAsaasWebhookRouter } = await import('../asaas.js');
  app = new Hono();
  app.route('/webhooks/asaas', createAsaasWebhookRouter());
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('POST /webhooks/asaas', () => {
  it('returns 401 when accessToken is wrong', async () => {
    const res = await app.request('/webhooks/asaas', {
      method: 'POST',
      body: JSON.stringify({
        event: 'PAYMENT_RECEIVED',
        payment: { id: 'pay-001' },
        accessToken: 'wrong-token',
      }),
      headers: { 'Content-Type': 'application/json' },
    });
    expect(res.status).toBe(401);
    expect(qstashMock.publishJSON).not.toHaveBeenCalled();
  });

  it('returns 200 and enqueues when token is correct', async () => {
    const res = await app.request('/webhooks/asaas', {
      method: 'POST',
      body: JSON.stringify({
        event: 'PAYMENT_RECEIVED',
        payment: { id: 'pay-001' },
        accessToken: WEBHOOK_TOKEN,
      }),
      headers: { 'Content-Type': 'application/json' },
    });
    expect(res.status).toBe(200);
    expect(qstashMock.publishJSON).toHaveBeenCalledOnce();
  });

  it('returns 200 without re-enqueuing on duplicate (Redis NX already set)', async () => {
    redisMock.set.mockResolvedValue(null); // NX failed — key already exists

    const res = await app.request('/webhooks/asaas', {
      method: 'POST',
      body: JSON.stringify({
        event: 'PAYMENT_RECEIVED',
        payment: { id: 'pay-001' },
        accessToken: WEBHOOK_TOKEN,
      }),
      headers: { 'Content-Type': 'application/json' },
    });
    expect(res.status).toBe(200);
    expect(qstashMock.publishJSON).not.toHaveBeenCalled();
  });

  it('returns 200 without enqueue when payment.id is missing', async () => {
    const res = await app.request('/webhooks/asaas', {
      method: 'POST',
      body: JSON.stringify({
        event: 'PAYMENT_RECEIVED',
        accessToken: WEBHOOK_TOKEN,
      }),
      headers: { 'Content-Type': 'application/json' },
    });
    expect(res.status).toBe(200);
    expect(qstashMock.publishJSON).not.toHaveBeenCalled();
    expect(redisMock.set).not.toHaveBeenCalled();
  });
});
