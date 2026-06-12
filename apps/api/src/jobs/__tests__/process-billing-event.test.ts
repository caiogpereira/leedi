import { describe, it, expect, vi, beforeEach } from 'vitest';

const TENANT_ID = 'tttttttt-tttt-4ttt-8ttt-tttttttttttt';
const SUB_ID = 'ssssssss-ssss-4sss-8sss-ssssssssssss';
const PAYMENT_ID = 'pay-001';

// ─── DB mock state ────────────────────────────────────────────────────────────

const state = vi.hoisted(() => ({
  invoiceRow: null as Record<string, unknown> | null,
  subscriptionRow: null as Record<string, unknown> | null,
  tenantStatus: 'active' as string | null,
  sqlExecuted: [] as string[],
  insertedAudit: 0,
}));

const sendSpy = vi.hoisted(() => vi.fn());

vi.mock('@leedi/db', () => {
  function makeTx() {
    return {
      select: () => {
        // Decide which table by inspecting .from() at resolution time.
        let table = '';
        const chain: Record<string, (...a: unknown[]) => unknown> = {};
        chain.select = () => chain;
        chain.from = (t: unknown) => {
          table = (t as { __table?: string })?.__table ?? '';
          return chain;
        };
        chain.where = () => chain;
        chain.limit = () => {
          if (table === 'invoices') return Promise.resolve(state.invoiceRow ? [state.invoiceRow] : []);
          if (table === 'subscriptions')
            return Promise.resolve(state.subscriptionRow ? [state.subscriptionRow] : []);
          if (table === 'tenants')
            return Promise.resolve(state.tenantStatus ? [{ status: state.tenantStatus }] : []);
          return Promise.resolve([]);
        };
        return chain;
      },
      execute: vi.fn().mockImplementation((sqlTag: unknown) => {
        const s = String(sqlTag);
        state.sqlExecuted.push(s);
        // Simulate the invoice row coming into existence after an upsert insert.
        if (s.includes('INSERT INTO "invoices"') && !state.invoiceRow) {
          state.invoiceRow = {
            id: 'inv-new',
            tenantId: state.subscriptionRow?.tenantId ?? TENANT_ID,
            status: 'pendente',
          };
        }
        return Promise.resolve({ rows: [] });
      }),
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockImplementation(() => {
          state.insertedAudit++;
          return Promise.resolve([]);
        }),
      }),
    };
  }

  return {
    withServiceRole: vi.fn(async (fn: (tx: unknown) => unknown) => fn(makeTx())),
    schema: {
      invoices: { __table: 'invoices', id: 'i.id', tenantId: 'i.tenant_id', asaasPaymentId: 'i.asaas_payment_id', status: 'i.status' },
      subscriptions: { __table: 'subscriptions', id: 's.id', tenantId: 's.tenant_id', asaasSubscriptionId: 's.asaas_subscription_id', asaasCustomerId: 's.asaas_customer_id' },
      tenants: { __table: 'tenants', id: 't.id', status: 't.status' },
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
  createNotificationStub: () => ({ send: sendSpy }),
}));

vi.mock('@leedi/observability', () => ({ captureException: vi.fn() }));

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('processBillingEvent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.invoiceRow = null;
    state.subscriptionRow = { id: SUB_ID, tenantId: TENANT_ID };
    state.tenantStatus = 'active';
    state.sqlExecuted = [];
    state.insertedAudit = 0;
  });

  it('PAYMENT_CREATED: materialises an invoice row (upsert) for a resolvable subscription', async () => {
    state.invoiceRow = null; // no invoice yet
    const { processBillingEvent } = await import('../process-billing-event.js');

    const result = await processBillingEvent({
      event: 'PAYMENT_CREATED',
      payment: { id: PAYMENT_ID, subscription: 'sub_1', value: 697, dueDate: '2026-07-03' },
    });

    expect(result.processed).toBe(true);
    expect(state.sqlExecuted.some((s) => s.includes('INSERT INTO "invoices"'))).toBe(true);
    expect(state.sqlExecuted.some((s) => s.includes('ON CONFLICT'))).toBe(true);
  });

  it('PAYMENT_CREATED: no-op (no insert) when the subscription cannot be resolved', async () => {
    state.invoiceRow = null;
    state.subscriptionRow = null; // unresolvable
    const { processBillingEvent } = await import('../process-billing-event.js');

    const result = await processBillingEvent({
      event: 'PAYMENT_CREATED',
      payment: { id: PAYMENT_ID, subscription: 'sub_unknown' },
    });

    expect(result.processed).toBe(true);
    expect(state.sqlExecuted.some((s) => s.includes('INSERT INTO "invoices"'))).toBe(false);
  });

  it('PAYMENT_RECEIVED (was blocked): marks pago, subscription ativa, unblocks tenant + notifies reactivation', async () => {
    state.invoiceRow = { id: 'inv-1', tenantId: TENANT_ID, status: 'pendente' };
    state.tenantStatus = 'blocked'; // read before the update → drives the reactivation notification

    const { processBillingEvent } = await import('../process-billing-event.js');
    const result = await processBillingEvent({
      event: 'PAYMENT_RECEIVED',
      payment: { id: PAYMENT_ID },
    });

    expect(result.processed).toBe(true);
    expect(state.sqlExecuted.some((s) => s.includes('pago'))).toBe(true);
    expect(state.sqlExecuted.some((s) => s.includes('active'))).toBe(true);
    expect(sendSpy).toHaveBeenCalledWith(expect.objectContaining({ tipo: 'conta_reativada' }));
  });

  it('PAYMENT_RECEIVED (routine renewal, not blocked): marks pago but does NOT send a reactivation notification', async () => {
    state.invoiceRow = { id: 'inv-1', tenantId: TENANT_ID, status: 'pendente' };
    state.tenantStatus = 'active'; // never blocked

    const { processBillingEvent } = await import('../process-billing-event.js');
    await processBillingEvent({ event: 'PAYMENT_RECEIVED', payment: { id: PAYMENT_ID } });

    expect(state.sqlExecuted.some((s) => s.includes('pago'))).toBe(true);
    expect(sendSpy).not.toHaveBeenCalled();
  });

  it('PAYMENT_RECEIVED (no prior invoice): upserts the invoice then marks it pago', async () => {
    state.invoiceRow = null; // CREATED was missed
    state.subscriptionRow = { id: SUB_ID, tenantId: TENANT_ID };

    const { processBillingEvent } = await import('../process-billing-event.js');
    const result = await processBillingEvent({
      event: 'PAYMENT_RECEIVED',
      payment: { id: PAYMENT_ID, subscription: 'sub_1', value: 697 },
    });

    expect(result.processed).toBe(true);
    // The invoice is inserted (upsert) AND then transitioned to pago — no lost payment.
    expect(state.sqlExecuted.some((s) => s.includes('INSERT INTO "invoices"'))).toBe(true);
    expect(state.sqlExecuted.some((s) => s.includes('pago'))).toBe(true);
  });

  it('PAYMENT_RECEIVED: idempotent — skips when invoice already pago', async () => {
    state.invoiceRow = { id: 'inv-1', tenantId: TENANT_ID, status: 'pago' };

    const { processBillingEvent } = await import('../process-billing-event.js');
    await processBillingEvent({ event: 'PAYMENT_RECEIVED', payment: { id: PAYMENT_ID } });

    expect(state.sqlExecuted.some((s) => s.includes('pago'))).toBe(false);
    expect(sendSpy).not.toHaveBeenCalled();
  });

  it('PAYMENT_OVERDUE: marks invoice atrasado + subscription atrasada, does NOT block tenant', async () => {
    state.invoiceRow = { id: 'inv-1', tenantId: TENANT_ID, status: 'pendente' };

    const { processBillingEvent } = await import('../process-billing-event.js');
    await processBillingEvent({ event: 'PAYMENT_OVERDUE', payment: { id: PAYMENT_ID } });

    expect(state.sqlExecuted.some((s) => s.includes('atrasada'))).toBe(true);
    expect(state.sqlExecuted.some((s) => s.includes('blocked'))).toBe(false);
  });

  it('PAYMENT_DELETED: marks cancelado + writes an audit_log entry', async () => {
    state.invoiceRow = { id: 'inv-1', tenantId: TENANT_ID, status: 'pendente' };

    const { processBillingEvent } = await import('../process-billing-event.js');
    await processBillingEvent({ event: 'PAYMENT_DELETED', payment: { id: PAYMENT_ID } });

    expect(state.sqlExecuted.some((s) => s.includes('cancelado'))).toBe(true);
    expect(state.insertedAudit).toBeGreaterThan(0);
  });

  it('returns processed:false when payment.id is missing', async () => {
    const { processBillingEvent } = await import('../process-billing-event.js');
    const result = await processBillingEvent({ event: 'PAYMENT_RECEIVED', payment: {} });
    expect(result.processed).toBe(false);
  });

  it('unrecognised events are a no-op (does not throw)', async () => {
    const { processBillingEvent } = await import('../process-billing-event.js');
    const result = await processBillingEvent({
      event: 'PAYMENT_BANK_SLIP_VIEWED',
      payment: { id: PAYMENT_ID },
    });
    expect(result.processed).toBe(true);
    expect(state.sqlExecuted.length).toBe(0);
  });
});
