import { describe, it, expect, vi, beforeEach } from 'vitest';

let executeRows: unknown[] = [];
const executeSpy = vi.fn(async (..._args: unknown[]) => executeRows);

// sql tag mocked to INTERPOLATE the template so tests can assert on the SQL
// contract (LATERAL joins, the previous-month overage period, ordering) — the
// raw query is the most complex, mock-blind surface in this use-case.
vi.mock('@leedi/db', () => ({
  withServiceRole: vi.fn((fn: (tx: unknown) => unknown) => fn({ execute: executeSpy })),
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
}));

import { listAllTenantsDetailed } from './list-all-tenants-detailed.js';

describe('listAllTenantsDetailed', () => {
  beforeEach(() => {
    executeRows = [];
    executeSpy.mockClear();
  });

  it('maps the rich lifecycle/financial columns with numeric + date coercion', async () => {
    executeRows = [
      {
        id: 't-1',
        name: 'Acme',
        slug: 'acme',
        status: 'active',
        plan: 'pro',
        created_at: '2026-06-01T00:00:00.000Z',
        billing_status: null,
        subscription_valor: '1497.00',
        overage_valor: '120.50',
        custo_ia_usd: '12.3400',
        ultimo_pagamento: '2026-06-05T10:00:00.000Z',
      },
      {
        id: 't-2',
        name: 'Beta',
        slug: 'beta',
        status: 'trial',
        plan: 'starter',
        created_at: '2026-05-20T00:00:00.000Z',
        billing_status: 'pendente_configuracao',
        subscription_valor: null,
        overage_valor: null,
        ultimo_pagamento: null,
      },
    ];

    const result = await listAllTenantsDetailed();

    expect(result[0]).toMatchObject({
      id: 't-1',
      name: 'Acme',
      status: 'active',
      billingStatus: null,
      subscriptionValor: 1497,
      overageValor: 120.5,
      custoIaUsd: 12.34,
    });
    expect(result[0]?.lastPayment).toBeInstanceOf(Date);
    expect(result[0]?.createdAt).toBeInstanceOf(Date);

    expect(result[1]).toMatchObject({
      id: 't-2',
      status: 'trial',
      billingStatus: 'pendente_configuracao',
      subscriptionValor: null,
      overageValor: 0,
      custoIaUsd: 0,
      lastPayment: null,
    });
  });

  it('builds the SQL contract: LATERAL joins, previous-month overage, no fan-out', async () => {
    await listAllTenantsDetailed();

    const querySql = String(executeSpy.mock.calls[0]?.[0]);
    // LATERAL subqueries (not GROUP BY) — the fan-out guard for tenants with >1 sub/invoice.
    expect(querySql).toContain('LEFT JOIN LATERAL');
    // Latest NON-cancelled subscription only.
    expect(querySql).toContain("status != 'cancelada'");
    // AC#1 "overage last month": usage_counters joined on the PREVIOUS month.
    expect(querySql).toContain("CURRENT_DATE - INTERVAL '1 month'");
    expect(querySql).toContain('overage_valor');
    // Current-month AI cost lives on a SEPARATE aliased join (uc_cur) so it does
    // not clobber the previous-month overage join (uc_prev).
    expect(querySql).toContain('uc_prev');
    expect(querySql).toContain('uc_cur');
    expect(querySql).toContain("TO_CHAR(CURRENT_DATE, 'YYYY-MM')");
    expect(querySql).toContain('custo_ia_usd');
    // Last payment = max invoice pago_em.
    expect(querySql).toContain('MAX(pago_em)');
    expect(querySql).toContain('billing_status');
    expect(querySql).toContain('ORDER BY t.created_at DESC');
  });
});
