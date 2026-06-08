import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── DB mock ──────────────────────────────────────────────────────────────────
// withTenant runs the callback with a fake tx. The fake query builder routes by
// the "marker" passed to .from(): a leads query resolves via .limit(1); a
// journey-events query resolves via .limit(20) after .orderBy().

const state = vi.hoisted(() => ({
  lead: undefined as Record<string, unknown> | undefined,
  events: [] as unknown[],
  tags: [] as unknown[],
}));

vi.mock('@leedi/db', () => {
  function makeTx() {
    let table = '';
    const b: Record<string, (...a: unknown[]) => unknown> = {};
    b.select = () => b;
    b.from = (t: unknown) => {
      table = String((t as { _marker?: string })?._marker ?? '');
      return b;
    };
    // lead_tags resolves at .where() (no orderBy/limit in that query).
    b.where = () => (table === 'lead_tags' ? state.tags : b);
    b.orderBy = () => b;
    b.limit = () => (table === 'leads' ? (state.lead ? [state.lead] : []) : state.events);
    return b;
  }
  return {
    withTenant: vi.fn((_id: string, fn: (tx: unknown) => unknown) => fn(makeTx())),
    schema: {
      leads: { _marker: 'leads' },
      leadJourneyEvents: { _marker: 'lead_journey_events' },
      leadTags: { _marker: 'lead_tags' },
    },
    eq: vi.fn(),
    and: vi.fn(),
    sql: vi.fn(),
  };
});

const ctx = { tenantId: 't1', leadPhone: '+5511999999999' };

describe('buscarHistoricoLead', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.lead = undefined;
    state.events = [];
    state.tags = [];
  });

  it('returns the documented shape with purchase + qualification + recorrente (AC#1)', async () => {
    state.lead = {
      id: 'lead-1',
      nome: 'Ana',
      telefone: '+5511999999999',
      temperatura: 'morno',
      status: 'ativo',
      comprou: true,
      produtoCompradoId: 'prod-9',
      qualificacao: { dor: 'preço', orcamento: 'medio' },
      leadRecorrente: true,
    };
    state.events = [
      { tipo: 'mensagem', detalhes: {}, createdAt: new Date('2026-05-01') },
    ];
    state.tags = [{ tag: 'interessado' }, { tag: 'aluno-antigo' }];

    const { buscarHistoricoLead } = await import('../buscar-historico-lead.js');
    const res = await buscarHistoricoLead(ctx);

    expect(res.found).toBe(true);
    expect(res.lead).toMatchObject({ comprou: true, produtoCompradoId: 'prod-9' });
    expect(res.qualificacao).toEqual({ dor: 'preço', orcamento: 'medio' });
    expect(res.lead_recorrente).toBe(true);
    expect(res.recentEvents).toHaveLength(1);
    expect(res.tags).toEqual(['interessado', 'aluno-antigo']);
  });

  it('surfaces previous objection events for a recurring lead (AC#5)', async () => {
    state.lead = {
      id: 'lead-2',
      nome: 'Bob',
      telefone: '+5511999999999',
      temperatura: 'frio',
      status: 'ativo',
      comprou: false,
      produtoCompradoId: null,
      qualificacao: {},
      leadRecorrente: true,
    };
    // Honest ordering: the objection is within the (newest-first) window.
    state.events = [
      { tipo: 'mensagem', detalhes: {}, createdAt: new Date('2026-05-10') },
      { tipo: 'objecao', detalhes: { texto: 'achei caro' }, createdAt: new Date('2026-05-09') },
    ];

    const { buscarHistoricoLead } = await import('../buscar-historico-lead.js');
    const res = await buscarHistoricoLead(ctx);

    expect(res.lead_recorrente).toBe(true);
    const objections = res.recentEvents.filter((e) => e.tipo === 'objecao');
    expect(objections).toHaveLength(1);
    expect(objections[0]?.detalhes).toEqual({ texto: 'achei caro' });
  });

  it('returns a not-found result when the lead is absent', async () => {
    const { buscarHistoricoLead } = await import('../buscar-historico-lead.js');
    const res = await buscarHistoricoLead(ctx);
    expect(res.found).toBe(false);
    expect(res.lead).toBeNull();
    expect(res.recentEvents).toEqual([]);
  });

  it('reads through withTenant with the correct tenantId', async () => {
    state.lead = {
      id: 'lead-3',
      nome: null,
      telefone: '+5511999999999',
      temperatura: 'frio',
      status: 'ativo',
      comprou: false,
      produtoCompradoId: null,
      qualificacao: {},
      leadRecorrente: false,
    };
    const { buscarHistoricoLead } = await import('../buscar-historico-lead.js');
    const { withTenant } = await import('@leedi/db');
    await buscarHistoricoLead(ctx);
    expect(withTenant).toHaveBeenCalledWith('t1', expect.any(Function));
  });
});
