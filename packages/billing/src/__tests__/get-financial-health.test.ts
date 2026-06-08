import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockExecute } = vi.hoisted(() => {
  const mockExecute = vi.fn();
  return { mockExecute };
});

// sql tag is mocked to return the interpolated query string so tests can assert
// on the SQL contract (FILTER clauses, status literals — the enum trap guard).
vi.mock('@leedi/db', () => ({
  withServiceRole: vi.fn((fn: (tx: unknown) => unknown) => fn({ execute: mockExecute })),
  schema: {},
  sql: vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => {
    let result = '';
    strings.forEach((s, i) => {
      result += s;
      if (i < values.length) result += String(values[i]);
    });
    return result;
  }),
}));

import { getFinancialHealth } from '../use-cases/get-financial-health.js';

describe('getFinancialHealth', () => {
  beforeEach(() => {
    mockExecute.mockReset();
  });

  function primeQueries(opts?: {
    subs?: Record<string, unknown>;
    inv?: Record<string, unknown>;
    delinquents?: Record<string, unknown>[];
  }) {
    // Order matches use-case: 1) subscriptions agg, 2) invoices agg, 3) delinquents
    mockExecute.mockResolvedValueOnce([
      opts?.subs ?? { mrr: '6970.00', projected: '8467.00', churn: '2' },
    ]);
    mockExecute.mockResolvedValueOnce([
      opts?.inv ?? { received: '3500.00', open_receivables: '1200.00' },
    ]);
    mockExecute.mockResolvedValueOnce(opts?.delinquents ?? []);
  }

  it('coerces numeric aggregate strings to numbers (AC#1, AC#4)', async () => {
    primeQueries();

    const result = await getFinancialHealth();

    expect(result.mrr).toBe(6970);
    expect(result.projectedRevenue).toBe(8467);
    expect(result.receivedThisMonth).toBe(3500);
    expect(result.openReceivables).toBe(1200);
    expect(result.churnThisMonth).toBe(2);
  });

  it('defaults null aggregates to 0 (no subscriptions/invoices yet)', async () => {
    primeQueries({
      subs: { mrr: null, projected: null, churn: '0' },
      inv: { received: null, open_receivables: null },
    });

    const result = await getFinancialHealth();

    expect(result.mrr).toBe(0);
    expect(result.projectedRevenue).toBe(0);
    expect(result.receivedThisMonth).toBe(0);
    expect(result.openReceivables).toBe(0);
    expect(result.churnThisMonth).toBe(0);
  });

  it('maps and coerces the delinquency list (AC#2)', async () => {
    primeQueries({
      delinquents: [
        {
          tenant_id: 't1',
          tenant_name: 'Acme',
          plano: 'pro',
          days_overdue: '12',
          total_overdue: '1497.00',
        },
        {
          tenant_id: 't2',
          tenant_name: 'Globex',
          plano: 'starter',
          days_overdue: '3',
          total_overdue: '697.00',
        },
      ],
    });

    const result = await getFinancialHealth();

    expect(result.delinquents).toHaveLength(2);
    expect(result.delinquents[0]).toEqual({
      tenantId: 't1',
      tenantName: 'Acme',
      plano: 'pro',
      daysOverdue: 12,
      totalOverdue: 1497,
    });
    expect(result.delinquents[1]!.daysOverdue).toBe(3);
  });

  it('returns empty delinquents array when no tenant is overdue (AC#2 empty state)', async () => {
    primeQueries();

    const result = await getFinancialHealth();

    expect(result.delinquents).toEqual([]);
  });

  it('MRR sums only ativa subscriptions; projected includes atrasada (enum trap)', async () => {
    primeQueries();
    await getFinancialHealth();

    const subsSql = String(mockExecute.mock.calls[0]![0]);
    expect(subsSql).toContain("FILTER (WHERE status = 'ativa')");
    expect(subsSql).toContain("status IN ('ativa', 'atrasada')");
    // churn counts only cancelada in the current month
    expect(subsSql).toContain("status = 'cancelada'");
    expect(subsSql).toContain("date_trunc('month', CURRENT_DATE)");
  });

  it('received uses pago_em this month; open receivables filter excludes pago/cancelado', async () => {
    primeQueries();
    await getFinancialHealth();

    const invSql = String(mockExecute.mock.calls[1]![0]);
    expect(invSql).toContain('pago_em >=');
    expect(invSql).toContain("status IN ('pendente', 'atrasado')");
  });

  it('delinquency list filters strictly on atrasado invoices (AC#2 pitfall)', async () => {
    primeQueries();
    await getFinancialHealth();

    const delinquentSql = String(mockExecute.mock.calls[2]![0]);
    expect(delinquentSql).toContain("i.status = 'atrasado'");
    expect(delinquentSql).toContain('ORDER BY days_overdue DESC');
  });
});
