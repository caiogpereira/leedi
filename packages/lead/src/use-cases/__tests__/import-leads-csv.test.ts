import { describe, expect, it, vi, beforeEach } from 'vitest';

/**
 * Mock @leedi/db. The use case, per chunk, runs:
 *   tx.insert(table).values(rows).onConflictDoNothing().returning({ id }) -> insertedRows
 *
 * The mock chain remembers the `values` it was given and, on `.returning()`,
 * resolves to one `{ id }` per row whose telefone is NOT registered as an
 * existing-conflict in `existingTelefones`. This lets tests simulate the
 * UNIQUE(tenant_id, telefone) conflict deterministically without a real DB.
 */
const existingTelefones = new Set<string>();
const insertCalls: Array<{ rowCount: number; tenantIds: string[] }> = [];

function makeInsertChain() {
  let captured: Array<{ telefone: string; tenantId: string }> = [];
  const chain: Record<string, unknown> = {};
  chain.values = (rows: Array<{ telefone: string; tenantId: string }>) => {
    captured = rows;
    insertCalls.push({
      rowCount: rows.length,
      tenantIds: rows.map((r) => r.tenantId),
    });
    return chain;
  };
  chain.onConflictDoNothing = () => chain;
  chain.returning = () =>
    Promise.resolve(
      captured
        .filter((r) => !existingTelefones.has(r.telefone))
        .map((_, i) => ({ id: `id-${i}` }))
    );
  return chain;
}

vi.mock('@leedi/db', () => {
  return {
    withTenant: vi.fn(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (_tenantId: string, fn: (tx: any) => Promise<unknown>) =>
        fn({ insert: () => makeInsertChain() })
    ),
    schema: {
      leads: { id: 'leads.id' },
    },
  };
});

describe('importLeadsCsv', () => {
  beforeEach(() => {
    existingTelefones.clear();
    insertCalls.length = 0;
    vi.clearAllMocks();
  });

  it('inserts all valid rows and returns correct counts with zero conflicts', async () => {
    const { importLeadsCsv } = await import('../import-leads-csv.js');

    const result = await importLeadsCsv({
      tenantId: 'tenant-1',
      rows: [
        { telefone: '+5511999990001', nome: 'A' },
        { telefone: '+5511999990002', nome: 'B' },
        { telefone: '+5511999990003' },
      ],
    });

    expect(result).toEqual({ inserted: 3, duplicated: 0, errors: 0 });
  });

  it('scopes every insert to the tenant via withTenant', async () => {
    const { importLeadsCsv } = await import('../import-leads-csv.js');
    const { withTenant } = await import('@leedi/db');

    await importLeadsCsv({
      tenantId: 'tenant-xyz',
      rows: [{ telefone: '+5511999990001' }],
    });

    expect(withTenant).toHaveBeenCalledWith('tenant-xyz', expect.any(Function));
    expect(insertCalls[0]?.tenantIds).toEqual(['tenant-xyz']);
  });

  it('counts conflict rows as duplicated', async () => {
    const { importLeadsCsv } = await import('../import-leads-csv.js');

    existingTelefones.add('+5511999990002');

    const result = await importLeadsCsv({
      tenantId: 'tenant-1',
      rows: [
        { telefone: '+5511999990001' },
        { telefone: '+5511999990002' }, // pre-existing → conflict
        { telefone: '+5511999990003' },
      ],
    });

    expect(result).toEqual({ inserted: 2, duplicated: 1, errors: 0 });
  });

  it('chunks inserts into groups of 100', async () => {
    const { importLeadsCsv } = await import('../import-leads-csv.js');

    const rows = Array.from({ length: 250 }, (_, i) => ({
      telefone: `+551199999${String(i).padStart(4, '0')}`,
    }));

    const result = await importLeadsCsv({ tenantId: 'tenant-1', rows });

    expect(result.inserted).toBe(250);
    expect(insertCalls.map((c) => c.rowCount)).toEqual([100, 100, 50]);
  });

  it('returns all-zero counts for an empty input without touching the db', async () => {
    const { importLeadsCsv } = await import('../import-leads-csv.js');
    const { withTenant } = await import('@leedi/db');

    const result = await importLeadsCsv({ tenantId: 'tenant-1', rows: [] });

    expect(result).toEqual({ inserted: 0, duplicated: 0, errors: 0 });
    expect(withTenant).not.toHaveBeenCalled();
  });
});
