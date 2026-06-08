import { describe, it, expect, vi, beforeEach } from 'vitest';

const state = vi.hoisted(() => ({
  updates: [] as Record<string, unknown>[],
  inserts: [] as Record<string, unknown>[],
}));

vi.mock('@leedi/db', () => {
  function makeTx() {
    const tx: Record<string, unknown> = {};
    tx.update = () => {
      const u: Record<string, (...a: unknown[]) => unknown> = {};
      u.set = (...a: unknown[]) => {
        state.updates.push(a[0] as Record<string, unknown>);
        return u;
      };
      u.where = () => Promise.resolve();
      return u;
    };
    tx.insert = () => ({
      values: (row: Record<string, unknown>) => {
        state.inserts.push(row);
        return Promise.resolve();
      },
    });
    return tx;
  }
  return {
    withTenant: vi.fn((_id: string, fn: (tx: unknown) => unknown) => fn(makeTx())),
    schema: {
      leads: { _marker: 'leads' },
      leadJourneyEvents: { _marker: 'leadJourneyEvents' },
    },
    eq: vi.fn(),
    and: vi.fn(),
  };
});

const ctx = { tenantId: 't1', leadId: 'lead-1' };

describe('marcarIntencaoCompra', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.updates = [];
    state.inserts = [];
  });

  it("sets temperatura='quente' and logs a tipo='interesse' journey event (AC#2)", async () => {
    const { marcarIntencaoCompra } = await import('../marcar-intencao-compra.js');
    const res = await marcarIntencaoCompra({ productId: 'prod-1' }, ctx);

    expect(state.updates).toEqual([{ temperatura: 'quente' }]);
    expect(state.inserts).toHaveLength(1);
    expect(state.inserts[0]).toMatchObject({
      tenantId: 't1',
      leadId: 'lead-1',
      tipo: 'interesse',
      detalhes: { produto_id: 'prod-1', agente_id: 'agent' },
    });
    expect(res).toEqual({ updated: true });
  });

  it('records produto_id as null when no productId is supplied', async () => {
    const { marcarIntencaoCompra } = await import('../marcar-intencao-compra.js');
    await marcarIntencaoCompra({}, ctx);
    expect(state.inserts[0]).toMatchObject({
      detalhes: { produto_id: null, agente_id: 'agent' },
    });
  });
});
