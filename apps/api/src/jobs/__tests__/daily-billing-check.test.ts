import { describe, it, expect, vi, beforeEach } from 'vitest';

const TENANT_ID = 'tttttttt-tttt-4ttt-8ttt-tttttttttttt';

// ─── State ──────────────────────────────────────────────────────────────────
const state = vi.hoisted(() => ({
  overdueRows: [] as Array<{ invoiceId: string; tenantId: string; vencimento: string; tenantStatus: string }>,
  sqlExecuted: [] as string[],
}));

const notifySpy = vi.hoisted(() => vi.fn());

vi.mock('@leedi/db', () => ({
  withServiceRole: vi.fn(async (fn: (tx: unknown) => unknown) =>
    fn({
      execute: vi.fn().mockImplementation((sqlTag: unknown) => {
        const s = String(sqlTag);
        // The overdue lookup is the only SELECT; everything else is an UPDATE.
        if (s.includes('SELECT')) {
          return Promise.resolve({ rows: state.overdueRows });
        }
        state.sqlExecuted.push(s);
        return Promise.resolve({ rows: [] });
      }),
    })
  ),
  sql: Object.assign(
    (strings: TemplateStringsArray, ...values: unknown[]) => {
      let result = '';
      strings.forEach((str, i) => {
        result += str;
        if (i < values.length) result += String(values[i]);
      });
      return result;
    },
    { raw: (s: string) => s }
  ),
}));

vi.mock('@leedi/notification', () => ({
  sendNotificationToTenantRole: notifySpy,
}));

vi.mock('@leedi/observability', () => ({ captureException: vi.fn() }));

// ─── Helpers ────────────────────────────────────────────────────────────────
function daysAgoISO(days: number): string {
  const d = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  return d.toISOString().slice(0, 10);
}

// ─── Tests ──────────────────────────────────────────────────────────────────
describe('runDailyBillingCheck (AC#4 partial / AC#5 full block)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.overdueRows = [];
    state.sqlExecuted = [];
  });

  it('blocks tenant 3 days overdue (partial) with the "pagamento atrasado" notice', async () => {
    state.overdueRows = [
      { invoiceId: 'inv-1', tenantId: TENANT_ID, vencimento: daysAgoISO(3), tenantStatus: 'active' },
    ];
    const { runDailyBillingCheck } = await import('../daily-billing-check.js');
    const result = await runDailyBillingCheck();

    expect(result.blocked).toBe(1);
    expect(state.sqlExecuted.some((s) => s.includes("status = 'blocked'"))).toBe(true);
    expect(notifySpy).toHaveBeenCalledWith(
      expect.objectContaining({ titulo: 'Pagamento atrasado', roles: ['owner'] })
    );
  });

  it('suspends tenant 7 days overdue (full) with the "conta suspensa" notice', async () => {
    state.overdueRows = [
      { invoiceId: 'inv-1', tenantId: TENANT_ID, vencimento: daysAgoISO(7), tenantStatus: 'active' },
    ];
    const { runDailyBillingCheck } = await import('../daily-billing-check.js');
    const result = await runDailyBillingCheck();

    expect(result.blocked).toBe(1);
    expect(notifySpy).toHaveBeenCalledWith(
      expect.objectContaining({ titulo: 'Conta suspensa por inadimplência' })
    );
  });

  it('does NOT block a tenant only 2 days overdue (below the 3-day threshold)', async () => {
    state.overdueRows = [
      { invoiceId: 'inv-1', tenantId: TENANT_ID, vencimento: daysAgoISO(2), tenantStatus: 'active' },
    ];
    const { runDailyBillingCheck } = await import('../daily-billing-check.js');
    const result = await runDailyBillingCheck();

    expect(result.blocked).toBe(0);
    expect(state.sqlExecuted.length).toBe(0);
    expect(notifySpy).not.toHaveBeenCalled();
  });

  it('skips a tenant that is already blocked (no duplicate block / notification)', async () => {
    state.overdueRows = [
      { invoiceId: 'inv-1', tenantId: TENANT_ID, vencimento: daysAgoISO(10), tenantStatus: 'blocked' },
    ];
    const { runDailyBillingCheck } = await import('../daily-billing-check.js');
    const result = await runDailyBillingCheck();

    expect(result.blocked).toBe(0);
    expect(state.sqlExecuted.length).toBe(0);
    expect(notifySpy).not.toHaveBeenCalled();
  });
});
