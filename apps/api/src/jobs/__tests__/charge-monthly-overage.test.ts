import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PaymentProvider } from '@leedi/billing';

const state = vi.hoisted(() => ({
  rows: [] as Record<string, unknown>[],
  executed: [] as string[],
  callCount: 0,
}));

vi.mock('@leedi/db', () => ({
  withServiceRole: vi.fn(async (fn: (tx: unknown) => unknown) =>
    fn({
      execute: (s: unknown) => {
        state.executed.push(String(s));
        state.callCount += 1;
        // First execute is the SELECT; later ones are INSERT/UPDATE.
        return Promise.resolve(state.callCount === 1 ? state.rows : []);
      },
    })
  ),
  sql: Object.assign(
    (strings: TemplateStringsArray, ...values: unknown[]) => {
      let r = '';
      strings.forEach((s, i) => {
        r += s;
        if (i < values.length) r += String(values[i]);
      });
      return r;
    },
    { raw: (s: string) => s }
  ),
}));

vi.mock('@leedi/usage', () => ({ MIN_OVERAGE_CHARGE_BRL: 5.0 }));
vi.mock('@leedi/observability', () => ({ captureException: vi.fn() }));

function makeProvider(overrides?: Partial<PaymentProvider>): PaymentProvider {
  return {
    criarCliente: vi.fn(),
    criarAssinatura: vi.fn(),
    cancelarAssinatura: vi.fn(),
    atualizarAssinatura: vi.fn(),
    criarCobrancaAvulsa: vi.fn().mockResolvedValue({
      paymentId: 'pay-1',
      vencimento: '2026-07-10',
      invoiceUrl: 'https://asaas/i/pay-1',
    }),
    verificarWebhook: vi.fn(),
    ...overrides,
  };
}

function row(over: Partial<Record<string, unknown>>) {
  return {
    tenantId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    tenantName: 'Tenant A',
    periodo: '2026-05',
    overageValor: '10.00',
    conversasLimite: 500,
    asaasCustomerId: 'cus_1',
    ...over,
  };
}

describe('chargeMonthlyOverage', () => {
  beforeEach(() => {
    state.rows = [];
    state.executed = [];
    state.callCount = 0;
    vi.clearAllMocks();
  });

  it('charges a tenant whose overage is >= the minimum, with an idempotent externalReference', async () => {
    state.rows = [row({ overageValor: '12.00' })];
    const { chargeMonthlyOverage } = await import('../charge-monthly-overage.js');
    const provider = makeProvider();

    const res = await chargeMonthlyOverage(provider, { periodo: '2026-05' });

    expect(provider.criarCobrancaAvulsa).toHaveBeenCalledTimes(1);
    expect(provider.criarCobrancaAvulsa).toHaveBeenCalledWith(
      expect.objectContaining({
        customerId: 'cus_1',
        valor: 12,
        externalReference: 'overage:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa:2026-05',
      })
    );
    expect(res).toMatchObject({ considered: 1, charged: 1, carriedForward: 0, skippedNoCustomer: 0 });
    // Invoice insert + the overage_cobrado_em mark both ran.
    expect(state.executed.some((s) => s.includes('INSERT INTO "invoices"'))).toBe(true);
    expect(state.executed.some((s) => s.includes('overage_cobrado_em" = now()'))).toBe(true);
  });

  it('carries a below-minimum overage into the next month instead of charging', async () => {
    state.rows = [row({ overageValor: '3.20' })];
    const { chargeMonthlyOverage } = await import('../charge-monthly-overage.js');
    const provider = makeProvider();

    const res = await chargeMonthlyOverage(provider, { periodo: '2026-05' });

    expect(provider.criarCobrancaAvulsa).not.toHaveBeenCalled();
    expect(res).toMatchObject({ charged: 0, carriedForward: 1 });
    // Rolled into the next month's counter (upsert) AND the source period marked.
    expect(
      state.executed.some(
        (s) => s.includes('INSERT INTO "usage_counters"') && s.includes('2026-06')
      )
    ).toBe(true);
    expect(state.executed.some((s) => s.includes('overage_cobrado_em" = now()'))).toBe(true);
  });

  it('skips a tenant with no Asaas customer without marking it charged', async () => {
    state.rows = [row({ asaasCustomerId: null, overageValor: '20.00' })];
    const { chargeMonthlyOverage } = await import('../charge-monthly-overage.js');
    const provider = makeProvider();

    const res = await chargeMonthlyOverage(provider, { periodo: '2026-05' });

    expect(provider.criarCobrancaAvulsa).not.toHaveBeenCalled();
    expect(res).toMatchObject({ charged: 0, skippedNoCustomer: 1 });
    expect(state.executed.some((s) => s.includes('overage_cobrado_em" = now()'))).toBe(false);
  });

  it('isolates a per-tenant charge failure (no throw, not marked → retried next run)', async () => {
    state.rows = [row({ overageValor: '15.00' })];
    const { chargeMonthlyOverage } = await import('../charge-monthly-overage.js');
    const provider = makeProvider({
      criarCobrancaAvulsa: vi.fn().mockRejectedValue(new Error('Asaas 400')),
    });

    const res = await chargeMonthlyOverage(provider, { periodo: '2026-05' });

    expect(res).toMatchObject({ considered: 1, charged: 0 });
    // Charge failed before the mark — period stays unmarked for retry.
    expect(state.executed.some((s) => s.includes('overage_cobrado_em" = now()'))).toBe(false);
  });
});

describe('previousPeriod', () => {
  it('returns the previous calendar month as YYYY-MM', async () => {
    const { previousPeriod } = await import('../charge-monthly-overage.js');
    expect(previousPeriod(new Date('2026-06-15T00:00:00Z'))).toBe('2026-05');
    expect(previousPeriod(new Date('2026-01-03T00:00:00Z'))).toBe('2025-12');
  });
});
