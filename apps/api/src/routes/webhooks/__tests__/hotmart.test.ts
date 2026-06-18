import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';

const TENANT_ID = '11111111-1111-4111-8111-111111111111';
const WEBHOOK_URL_PATH = 'abc123-path';
const WEBHOOK_SECRET = 'my-hottok-secret';

// ─── Shared mock state ────────────────────────────────────────────────────────
let mockIntegrationRow: object | null = {
  id: 'int-1',
  tenantId: TENANT_ID,
  webhookSecret: WEBHOOK_SECRET,
  gateway: 'hotmart',
  ativo: true,
};
let mockDupeCount = 0;

const { mockPublishJSON } = vi.hoisted(() => {
  const mockPublishJSON = vi.fn().mockResolvedValue({ messageId: 'qstash-123' });
  return { mockPublishJSON };
});

vi.mock('@leedi/db', () => {
  const makeTx = (integrationResult: object | null, dupeCount: number) => ({
    // drizzle-orm/postgres-js resolves query rows DIRECTLY as an array (a RowList),
    // not a { rows } object — mirror the real driver shape so the mock can't mask
    // the row-read bug fixed in F-39.
    execute: vi.fn().mockResolvedValue(dupeCount > 0 ? [{}] : []),
    select: () => ({
      from: () => ({
        where: () => ({
          limit: () => Promise.resolve(integrationResult ? [integrationResult] : []),
        }),
      }),
    }),
    insert: () => ({
      values: () => ({
        returning: () => Promise.resolve([{ id: 'evt-1' }]),
      }),
    }),
  });

  return {
    db: {
      transaction: vi.fn(async (fn: (tx: unknown) => unknown) =>
        fn(makeTx(mockIntegrationRow, mockDupeCount))
      ),
    },
    withTenant: vi.fn((_id: string, fn: (tx: unknown) => unknown) =>
      fn(makeTx(mockIntegrationRow, mockDupeCount))
    ),
    schema: {
      gatewayIntegrations: { __name: 'gateway_integrations' },
      gatewayEvents: { __name: 'gateway_events' },
    },
    eq: vi.fn(),
    sql: Object.assign(
      (strings: TemplateStringsArray, ..._vals: unknown[]) => ({ strings, values: _vals }),
      { raw: (s: string) => s }
    ),
  };
});

vi.mock('@leedi/gateway', () => ({
  HotmartNormalizer: {
    normalize: vi.fn().mockReturnValue({
      eventoCanonical: 'compra_aprovada',
      hotmartTransactionId: 'HP12345678901234',
      phoneNumber: '+5511999998888',
      productId: 'PROD-001',
      productName: 'Curso Premium',
      value: 297,
    }),
  },
}));

vi.mock('@leedi/config', () => ({
  env: {
    QSTASH_TOKEN: 'test-qstash-token',
    BETTER_AUTH_URL: 'http://localhost:3000',
    API_PORT: 3003,
  },
}));

vi.mock('@upstash/qstash', () => ({
  Client: vi.fn().mockImplementation(() => ({
    publishJSON: mockPublishJSON,
  })),
}));

vi.mock('@leedi/observability', () => ({
  captureException: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
  mockIntegrationRow = {
    id: 'int-1',
    tenantId: TENANT_ID,
    webhookSecret: WEBHOOK_SECRET,
    gateway: 'hotmart',
    ativo: true,
  };
  mockDupeCount = 0;
  mockPublishJSON.mockResolvedValue({ messageId: 'qstash-123' });
});

let app: Hono;
beforeEach(async () => {
  const { createHotmartWebhookRouter } = await import('../hotmart.js');
  app = new Hono();
  app.route('/webhooks/hotmart', createHotmartWebhookRouter());
});

const validPayload = JSON.stringify({
  event: 'PURCHASE_APPROVED',
  data: {
    purchase: { transaction: 'HP12345678901234', price: { value: 297 } },
    buyer: { phone: '+5511999998888' },
    product: { id: 'PROD-001', name: 'Curso' },
  },
});

describe('POST /webhooks/hotmart/:webhookUrlPath', () => {
  it('returns 404 when webhookUrlPath is not found', async () => {
    mockIntegrationRow = null;
    const res = await app.request(
      `/webhooks/hotmart/unknown-path?hottok=${WEBHOOK_SECRET}`,
      { method: 'POST', body: validPayload, headers: { 'Content-Type': 'application/json' } }
    );
    expect(res.status).toBe(404);
  });

  it('returns 401 when hottok is invalid', async () => {
    const res = await app.request(
      `/webhooks/hotmart/${WEBHOOK_URL_PATH}?hottok=wrong-token`,
      { method: 'POST', body: validPayload, headers: { 'Content-Type': 'application/json' } }
    );
    expect(res.status).toBe(401);
  });

  it('returns 401 when hottok is missing', async () => {
    const res = await app.request(`/webhooks/hotmart/${WEBHOOK_URL_PATH}`, {
      method: 'POST',
      body: validPayload,
      headers: { 'Content-Type': 'application/json' },
    });
    expect(res.status).toBe(401);
  });

  it('returns 200 OK with valid hottok', async () => {
    const res = await app.request(
      `/webhooks/hotmart/${WEBHOOK_URL_PATH}?hottok=${WEBHOOK_SECRET}`,
      { method: 'POST', body: validPayload, headers: { 'Content-Type': 'application/json' } }
    );
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toBe('OK');
  });
});
