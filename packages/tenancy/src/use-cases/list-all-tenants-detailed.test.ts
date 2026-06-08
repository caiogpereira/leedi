import { describe, it, expect, vi, beforeEach } from 'vitest';

let executeRows: unknown[] = [];
const executeSpy = vi.fn(async () => executeRows);

vi.mock('@leedi/db', () => ({
  withServiceRole: vi.fn((fn: (tx: unknown) => unknown) => fn({ execute: executeSpy })),
  sql: Object.assign((..._args: unknown[]) => ({}), { raw: (s: string) => s }),
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
    });
    expect(result[0]?.lastPayment).toBeInstanceOf(Date);
    expect(result[0]?.createdAt).toBeInstanceOf(Date);

    expect(result[1]).toMatchObject({
      id: 't-2',
      status: 'trial',
      billingStatus: 'pendente_configuracao',
      subscriptionValor: null,
      overageValor: 0,
      lastPayment: null,
    });
  });
});
