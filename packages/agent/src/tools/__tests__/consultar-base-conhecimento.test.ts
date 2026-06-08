import { describe, it, expect, vi, beforeEach } from 'vitest';

// The DB layer is mocked with a tiny query-builder that records the select() it
// receives and returns a configurable row set, plus captures journey inserts.
// We assert behavior (returned entries + whether/what journey event is logged)
// rather than re-implementing SQL — the actual filtering is exercised by the
// where()/and()/or()/isNull() calls, which we stub as identity markers.
const state = vi.hoisted(() => ({
  rows: [] as Record<string, unknown>[],
  inserts: [] as Record<string, unknown>[],
  whereArgs: [] as unknown[],
  limit: undefined as number | undefined,
}));

vi.mock('@leedi/db', () => {
  function makeTx() {
    const tx: Record<string, unknown> = {};
    tx.select = () => ({
      from: () => ({
        where: (w: unknown) => {
          state.whereArgs.push(w);
          return {
            limit: (n: number) => {
              state.limit = n;
              return Promise.resolve(state.rows);
            },
          };
        },
      }),
    });
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
      knowledgeBase: {
        tenantId: 'kb.tenantId',
        ativo: 'kb.ativo',
        tipo: 'kb.tipo',
        categoria: 'kb.categoria',
        perguntaOuObjecao: 'kb.perguntaOuObjecao',
        respostaOuContorno: 'kb.respostaOuContorno',
      },
      leadJourneyEvents: { _marker: 'leadJourneyEvents' },
    },
    eq: vi.fn((col: unknown, val: unknown) => ({ op: 'eq', col, val })),
    and: vi.fn((...args: unknown[]) => ({ op: 'and', args })),
    or: vi.fn((...args: unknown[]) => ({ op: 'or', args })),
    isNull: vi.fn((col: unknown) => ({ op: 'isNull', col })),
  };
});

const ctx = { tenantId: 't1', leadId: 'lead-1' };

const OBJECTION_ROW = {
  pergunta_ou_objecao: 'Está caro',
  resposta_ou_contorno: 'Veja o retorno sobre o investimento...',
};

describe('consultarBaseConhecimento', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.rows = [];
    state.inserts = [];
    state.whereArgs = [];
    state.limit = undefined;
  });

  it('returns matching objection entries for tipo=objecao + categoria (AC#1)', async () => {
    state.rows = [OBJECTION_ROW];
    const { consultarBaseConhecimento } = await import('../consultar-base-conhecimento.js');
    const res = await consultarBaseConhecimento({ tipo: 'objecao', categoria: 'preco' }, ctx);
    expect(res).toEqual({ entries: [OBJECTION_ROW] });
  });

  it('uses an (categoria IS NULL OR categoria = x) filter for objections with categoria (AC#1)', async () => {
    state.rows = [OBJECTION_ROW];
    const db = await import('@leedi/db');
    const { consultarBaseConhecimento } = await import('../consultar-base-conhecimento.js');
    await consultarBaseConhecimento({ tipo: 'objecao', categoria: 'preco' }, ctx);
    // or(isNull(categoria), eq(categoria, 'preco')) must be built
    expect(db.isNull).toHaveBeenCalledWith('kb.categoria');
    expect(db.or).toHaveBeenCalled();
  });

  it('returns all active FAQs for tipo=faq and ignores categoria (AC#2)', async () => {
    const faqs = [
      { pergunta_ou_objecao: 'Como funciona?', resposta_ou_contorno: 'Assim...' },
      { pergunta_ou_objecao: 'Tem suporte?', resposta_ou_contorno: 'Sim...' },
    ];
    state.rows = faqs;
    const db = await import('@leedi/db');
    const { consultarBaseConhecimento } = await import('../consultar-base-conhecimento.js');
    const res = await consultarBaseConhecimento({ tipo: 'faq', categoria: 'preco' }, ctx);
    expect(res).toEqual({ entries: faqs });
    // No categoria filter for FAQs — isNull/or never invoked.
    expect(db.isNull).not.toHaveBeenCalled();
    expect(db.or).not.toHaveBeenCalled();
  });

  it('returns { entries: [] } when nothing matches and NEVER throws (AC#3)', async () => {
    state.rows = [];
    const { consultarBaseConhecimento } = await import('../consultar-base-conhecimento.js');
    const res = await consultarBaseConhecimento({ tipo: 'objecao', categoria: 'tempo' }, ctx);
    expect(res).toEqual({ entries: [] });
  });

  it('caps the result set with a LIMIT for token cost', async () => {
    state.rows = [OBJECTION_ROW];
    const { consultarBaseConhecimento } = await import('../consultar-base-conhecimento.js');
    await consultarBaseConhecimento({ tipo: 'objecao', categoria: 'preco' }, ctx);
    expect(state.limit).toBe(20);
  });

  it('logs a tipo=objecao journey event with correct detalhes when an objection matches (Task 4)', async () => {
    state.rows = [OBJECTION_ROW];
    const { consultarBaseConhecimento } = await import('../consultar-base-conhecimento.js');
    await consultarBaseConhecimento({ tipo: 'objecao', categoria: 'preco' }, ctx);
    expect(state.inserts).toHaveLength(1);
    expect(state.inserts[0]).toMatchObject({
      tenantId: 't1',
      leadId: 'lead-1',
      tipo: 'objecao',
      detalhes: {
        categoria: 'preco',
        texto_objecao: 'Está caro',
        contorno_usado: 'Veja o retorno sobre o investimento...',
      },
    });
  });

  it('does NOT log a journey event when the objection result is empty', async () => {
    state.rows = [];
    const { consultarBaseConhecimento } = await import('../consultar-base-conhecimento.js');
    await consultarBaseConhecimento({ tipo: 'objecao', categoria: 'preco' }, ctx);
    expect(state.inserts).toHaveLength(0);
  });

  it('does NOT log a journey event for FAQ queries (FAQs never generate events)', async () => {
    state.rows = [
      { pergunta_ou_objecao: 'Como funciona?', resposta_ou_contorno: 'Assim...' },
    ];
    const { consultarBaseConhecimento } = await import('../consultar-base-conhecimento.js');
    await consultarBaseConhecimento({ tipo: 'faq' }, ctx);
    expect(state.inserts).toHaveLength(0);
  });

  it('records categoria as null in detalhes when objection has no categoria', async () => {
    state.rows = [OBJECTION_ROW];
    const { consultarBaseConhecimento } = await import('../consultar-base-conhecimento.js');
    await consultarBaseConhecimento({ tipo: 'objecao' }, ctx);
    expect(state.inserts[0]).toMatchObject({
      detalhes: { categoria: null },
    });
  });
});
