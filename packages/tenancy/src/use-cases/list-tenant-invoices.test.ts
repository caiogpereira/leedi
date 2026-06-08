import { describe, it, expect, vi, beforeEach } from 'vitest';

let executeRows: unknown[] = [];
const executeSpy = vi.fn(async () => executeRows);

vi.mock('@leedi/db', () => ({
  withServiceRole: vi.fn((fn: (tx: unknown) => unknown) => fn({ execute: executeSpy })),
  sql: Object.assign((..._args: unknown[]) => ({}), { raw: (s: string) => s }),
}));

import { getTenantInvoices } from './list-tenant-invoices.js';

const TENANT = '11111111-1111-4111-8111-111111111111';

describe('getTenantInvoices', () => {
  beforeEach(() => {
    executeRows = [];
    executeSpy.mockClear();
  });

  it('returns an empty array for a tenant with no invoices (not an error)', async () => {
    const result = await getTenantInvoices(TENANT);
    expect(result).toEqual([]);
  });

  it('maps and coerces invoice rows (numeric strings, nullable dates)', async () => {
    executeRows = [
      {
        id: 'inv-1',
        valor: '697.00',
        valor_overage: '50.00',
        vencimento: '2026-06-10',
        pago_em: '2026-06-08T12:00:00.000Z',
        status: 'pago',
        asaas_payment_id: 'pay_1',
        created_at: '2026-06-01T00:00:00.000Z',
      },
      {
        id: 'inv-2',
        valor: null,
        valor_overage: null,
        vencimento: null,
        pago_em: null,
        status: 'pendente',
        asaas_payment_id: null,
        created_at: '2026-05-01T00:00:00.000Z',
      },
    ];

    const result = await getTenantInvoices(TENANT);

    expect(result[0]).toMatchObject({
      id: 'inv-1',
      valor: 697,
      valorOverage: 50,
      vencimento: '2026-06-10',
      status: 'pago',
      asaasPaymentId: 'pay_1',
    });
    expect(result[0]?.pagoEm).toBeInstanceOf(Date);

    expect(result[1]).toMatchObject({
      id: 'inv-2',
      valor: null,
      valorOverage: 0,
      vencimento: null,
      pagoEm: null,
      status: 'pendente',
      asaasPaymentId: null,
    });
  });
});
