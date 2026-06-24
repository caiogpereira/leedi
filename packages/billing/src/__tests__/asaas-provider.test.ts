import { describe, it, expect, vi } from 'vitest';
import { AsaasProvider } from '../adapters/asaas-provider.js';

const SANDBOX_KEY = 'test-api-key';

describe('AsaasProvider.verificarWebhook', () => {
  const provider = new AsaasProvider(SANDBOX_KEY, true);
  const TOKEN = 'my-webhook-secret-token';

  it('returns true when the incoming token matches the expected token', () => {
    expect(provider.verificarWebhook(TOKEN, TOKEN)).toBe(true);
  });

  it('returns false when the incoming token does not match', () => {
    expect(provider.verificarWebhook('wrong-token', TOKEN)).toBe(false);
  });

  it('returns false when the incoming token is missing (undefined/null/empty)', () => {
    // Asaas sends the token in the `asaas-access-token` header; a request without
    // it (undefined) must be rejected — this is the real-world 401 case.
    expect(provider.verificarWebhook(undefined, TOKEN)).toBe(false);
    expect(provider.verificarWebhook(null, TOKEN)).toBe(false);
    expect(provider.verificarWebhook('', TOKEN)).toBe(false);
  });

  it('returns false when the expected token is empty (misconfiguration)', () => {
    expect(provider.verificarWebhook(TOKEN, '')).toBe(false);
  });

  it('uses constant-time comparison over equal-length sha256 digests', () => {
    // Near-miss tokens (differ by one char / length) must still return false.
    expect(provider.verificarWebhook(TOKEN.slice(0, -1), TOKEN)).toBe(false);
    expect(provider.verificarWebhook(TOKEN + 'x', TOKEN)).toBe(false);
  });
});

describe('AsaasProvider.atualizarAssinatura', () => {
  it('PUTs the new value to /subscriptions/{id} with updatePendingPayments', async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return {
        ok: true,
        json: async () => ({ id: 'asaas-sub-1', nextDueDate: '2026-07-01' }),
      } as Response;
    });
    vi.stubGlobal('fetch', fetchMock);

    const provider = new AsaasProvider(SANDBOX_KEY, true);
    await provider.atualizarAssinatura('asaas-sub-1', 'pro', 1497);

    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toContain('/subscriptions/asaas-sub-1');
    expect(calls[0]!.init.method).toBe('PUT');
    const body = JSON.parse(String(calls[0]!.init.body));
    expect(body.value).toBe(1497);
    expect(body.updatePendingPayments).toBe(true);

    vi.unstubAllGlobals();
  });
});

describe('AsaasProvider.criarCobrancaAvulsa', () => {
  it('POSTs a one-off boleto to /payments with the externalReference handle', async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return {
        ok: true,
        json: async () => ({
          id: 'pay_123',
          dueDate: '2026-07-10',
          invoiceUrl: 'https://asaas/i/pay_123',
        }),
      } as Response;
    });
    vi.stubGlobal('fetch', fetchMock);

    const provider = new AsaasProvider(SANDBOX_KEY, true);
    const res = await provider.criarCobrancaAvulsa({
      customerId: 'cus_1',
      valor: 12.5,
      descricao: 'Excedente de conversas — 2026-05',
      vencimento: '2026-07-10',
      externalReference: 'overage:tenant-1:2026-05',
    });

    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toContain('/payments');
    expect(calls[0]!.init.method).toBe('POST');
    const body = JSON.parse(String(calls[0]!.init.body));
    expect(body).toMatchObject({
      customer: 'cus_1',
      billingType: 'BOLETO',
      value: 12.5,
      dueDate: '2026-07-10',
      externalReference: 'overage:tenant-1:2026-05',
      // Late-payment penalties applied to every charge (10% fine + 2%/mo interest).
      fine: { value: 10, type: 'PERCENTAGE' },
      interest: { value: 2 },
    });
    expect(res).toEqual({
      paymentId: 'pay_123',
      vencimento: '2026-07-10',
      invoiceUrl: 'https://asaas/i/pay_123',
    });

    vi.unstubAllGlobals();
  });
});
