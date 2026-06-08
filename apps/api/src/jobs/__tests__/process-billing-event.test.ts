import { describe, it, expect, vi, beforeEach } from 'vitest';

const TENANT_ID = 'tttttttt-tttt-4ttt-8ttt-tttttttttttt';
const PAYMENT_ID = 'pay-001';

// ─── DB mock state ────────────────────────────────────────────────────────────

const state = vi.hoisted(() => ({
  invoiceRow: null as Record<string, unknown> | null,
  tenantStatus: 'active',
  updatedInvoiceStatus: null as string | null,
  sqlExecuted: [] as string[],
  insertCount: 0,
  serviceRoleCallCount: 0,
}));

vi.mock('@leedi/db', () => {
  function makeSelectChain(row: Record<string, unknown> | null) {
    const chain: Record<string, (...a: unknown[]) => unknown> = {};
    chain.select = () => chain;
    chain.from = () => chain;
    chain.where = () => chain;
    chain.limit = () => Promise.resolve(row ? [row] : []);
    return chain;
  }

  function makeTx(callIdx: number) {
    return {
      select: () => {
        if (callIdx === 0) return makeSelectChain(state.invoiceRow);
        return makeSelectChain({ status: state.tenantStatus });
      },
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockImplementation((_cond: unknown, setVals?: Record<string, unknown>) => {
            if (setVals?.status) state.updatedInvoiceStatus = String(setVals.status);
            return Promise.resolve([]);
          }),
        }),
      }),
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockImplementation(() => {
          state.insertCount++;
          return Promise.resolve([]);
        }),
      }),
      execute: vi.fn().mockImplementation((sqlTag: unknown) => {
        state.sqlExecuted.push(String(sqlTag));
        return Promise.resolve({ rows: [] });
      }),
    };
  }

  return {
    withServiceRole: vi.fn(async (fn: (tx: unknown) => unknown) => {
      const idx = state.serviceRoleCallCount++;
      return fn(makeTx(idx));
    }),
    schema: {
      invoices: { id: 'i.id', tenantId: 'i.tenant_id', asaasPaymentId: 'i.asaas_payment_id', status: 'i.status' },
      tenants: { id: 't.id', status: 't.status' },
      auditLogs: { acao: 'al.acao' },
    },
    eq: vi.fn(() => 'eq'),
    sql: Object.assign(
      (strings: TemplateStringsArray, ...values: unknown[]) => {
        let result = '';
        strings.forEach((s, i) => {
          result += s;
          if (i < values.length) result += String(values[i]);
        });
        return result;
      },
      { raw: (s: string) => s }
    ),
  };
});

vi.mock('@leedi/notification', () => ({
  createNotificationStub: () => ({
    send: vi.fn().mockResolvedValue(undefined),
  }),
}));

vi.mock('@leedi/observability', () => ({
  captureException: vi.fn(),
}));

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('processBillingEvent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.invoiceRow = null;
    state.tenantStatus = 'active';
    state.updatedInvoiceStatus = null;
    state.sqlExecuted = [];
    state.insertCount = 0;
    state.serviceRoleCallCount = 0;
  });

  it('PAYMENT_RECEIVED: updates invoice to pago, subscription to ativa, unblocks tenant', async () => {
    state.invoiceRow = { id: 'inv-1', tenantId: TENANT_ID, status: 'pendente' };
    state.tenantStatus = 'blocked';

    const { processBillingEvent } = await import('../process-billing-event.js');
    const result = await processBillingEvent({
      event: 'PAYMENT_RECEIVED',
      payment: { id: PAYMENT_ID },
    });

    expect(result.processed).toBe(true);
    // SQL should include UPDATE tenants SET status = 'active'
    expect(state.sqlExecuted.some((s) => s.includes('active'))).toBe(true);
  });

  it('PAYMENT_RECEIVED: idempotency — skips when invoice already pago', async () => {
    state.invoiceRow = { id: 'inv-1', tenantId: TENANT_ID, status: 'pago' };

    const { processBillingEvent } = await import('../process-billing-event.js');
    const result = await processBillingEvent({
      event: 'PAYMENT_RECEIVED',
      payment: { id: PAYMENT_ID },
    });

    expect(result.processed).toBe(true);
    // Only the invoice lookup should have happened, no updates
    expect(state.serviceRoleCallCount).toBe(1);
  });

  it('PAYMENT_OVERDUE: updates invoice to atrasado, does NOT block tenant immediately', async () => {
    state.invoiceRow = { id: 'inv-1', tenantId: TENANT_ID, status: 'pendente' };

    const { processBillingEvent } = await import('../process-billing-event.js');
    await processBillingEvent({
      event: 'PAYMENT_OVERDUE',
      payment: { id: PAYMENT_ID },
    });

    // SQL should contain atrasada (subscription) but NOT 'blocked' (tenant)
    expect(state.sqlExecuted.some((s) => s.includes('atrasada'))).toBe(true);
    expect(state.sqlExecuted.some((s) => s.includes('blocked'))).toBe(false);
  });

  it('PAYMENT_DELETED: creates audit_log entry', async () => {
    state.invoiceRow = { id: 'inv-1', tenantId: TENANT_ID, status: 'pendente' };

    const { processBillingEvent } = await import('../process-billing-event.js');
    await processBillingEvent({
      event: 'PAYMENT_DELETED',
      payment: { id: PAYMENT_ID },
    });

    expect(state.insertCount).toBeGreaterThan(0);
  });

  it('returns processed:false when payment.id is missing', async () => {
    const { processBillingEvent } = await import('../process-billing-event.js');
    const result = await processBillingEvent({ event: 'PAYMENT_RECEIVED', payment: {} });
    expect(result.processed).toBe(false);
  });
});
