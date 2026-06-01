import { describe, expect, it, vi, beforeEach } from 'vitest';

/**
 * Mock @leedi/db. listDispatchTargets runs:
 *   tx.select({...}).from(leads).where(eq(status, 'ativo')) -> rows
 *
 * The mock captures the `where` condition and applies the SAME predicate it
 * encodes to a fixture of mixed-status leads, so the test exercises the real
 * LGPD filter rather than a hand-fed result set. This is the opt-out seam, so
 * we verify exclusion behaviorally.
 */
interface LeadFixture {
  id: string;
  telefone: string;
  nome: string | null;
  status: 'ativo' | 'optout' | 'bloqueado';
}

let allLeads: LeadFixture[] = [];

vi.mock('@leedi/db', () => {
  const leadsTable = {
    id: 'leads.id',
    telefone: 'leads.telefone',
    nome: 'leads.nome',
    status: 'leads.status',
  };
  return {
    withTenant: vi.fn(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (_tenantId: string, fn: (tx: any) => Promise<unknown>) =>
        fn({
          select: () => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            let predicate: { col: unknown; val: unknown } | null = null;
            const chain: Record<string, unknown> = {};
            chain.from = () => chain;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            chain.where = (cond: any) => {
              predicate = cond;
              return chain;
            };
            chain.then = (resolve: (v: unknown) => unknown) => {
              const rows = allLeads
                .filter((l) =>
                  predicate && predicate.col === 'leads.status'
                    ? l.status === predicate.val
                    : true
                )
                .map((l) => ({ id: l.id, telefone: l.telefone, nome: l.nome }));
              return Promise.resolve(rows).then(resolve);
            };
            return chain;
          },
        })
    ),
    schema: { leads: leadsTable },
    eq: vi.fn((col: unknown, val: unknown) => ({ op: 'eq', col, val })),
  };
});

describe('listDispatchTargets', () => {
  beforeEach(() => {
    allLeads = [];
    vi.clearAllMocks();
  });

  it('excludes optout leads from dispatch targets (LGPD)', async () => {
    const { listDispatchTargets } = await import('../list-dispatch-targets.js');

    allLeads = [
      { id: 'a', telefone: '+5511000000001', nome: 'Ativo', status: 'ativo' },
      { id: 'b', telefone: '+5511000000002', nome: 'OptOut', status: 'optout' },
    ];

    const result = await listDispatchTargets({ tenantId: 'tenant-1' });

    expect(result.map((r) => r.id)).toEqual(['a']);
    expect(result.some((r) => r.id === 'b')).toBe(false);
  });

  it('returns ONLY ativo leads (excludes optout AND bloqueado)', async () => {
    const { listDispatchTargets } = await import('../list-dispatch-targets.js');

    allLeads = [
      { id: 'a1', telefone: '+5511000000011', nome: null, status: 'ativo' },
      { id: 'o1', telefone: '+5511000000012', nome: null, status: 'optout' },
      { id: 'x1', telefone: '+5511000000013', nome: null, status: 'bloqueado' },
      { id: 'a2', telefone: '+5511000000014', nome: 'Two', status: 'ativo' },
    ];

    const result = await listDispatchTargets({ tenantId: 'tenant-1' });

    expect(result.map((r) => r.id).sort()).toEqual(['a1', 'a2']);
  });

  it('scopes the read to the tenant via withTenant', async () => {
    const { listDispatchTargets } = await import('../list-dispatch-targets.js');
    const { withTenant } = await import('@leedi/db');

    await listDispatchTargets({ tenantId: 'tenant-xyz' });

    expect(withTenant).toHaveBeenCalledWith('tenant-xyz', expect.any(Function));
  });

  it('returns id, telefone and nome for each target', async () => {
    const { listDispatchTargets } = await import('../list-dispatch-targets.js');

    allLeads = [{ id: 'a', telefone: '+5511000000001', nome: 'Ana', status: 'ativo' }];

    const result = await listDispatchTargets({ tenantId: 'tenant-1' });

    expect(result[0]).toEqual({ id: 'a', telefone: '+5511000000001', nome: 'Ana' });
  });
});
