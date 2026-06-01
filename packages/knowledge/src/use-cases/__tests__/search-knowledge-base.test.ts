import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockEntries = [
  {
    perguntaOuObjecao: 'É muito caro',
    respostaOuContorno: 'O investimento se paga em 30 dias',
    tipo: 'objecao',
    categoria: 'preco',
  },
  {
    perguntaOuObjecao: 'Não tenho tempo',
    respostaOuContorno: 'São apenas 15 minutos por dia',
    tipo: 'objecao',
    categoria: 'tempo',
  },
];

vi.mock('@leedi/db', () => {
  let capturedConditions: unknown[] = [];
  const where = vi.fn((cond: unknown) => {
    capturedConditions = Array.isArray(cond) ? cond : [cond];
    return Promise.resolve(mockEntries);
  });
  const from = vi.fn().mockReturnValue({ where });
  const select = vi.fn().mockReturnValue({ from });
  const tx = { select };
  return {
    withTenant: vi.fn((_id: string, fn: (tx: typeof tx) => unknown) => fn(tx)),
    schema: {
      knowledgeBase: {
        tenantId: 'kb.tenant_id',
        ativo: 'kb.ativo',
        tipo: 'kb.tipo',
        categoria: 'kb.categoria',
        perguntaOuObjecao: 'kb.pergunta_ou_objecao',
        respostaOuContorno: 'kb.resposta_ou_contorno',
      },
    },
    eq: vi.fn((col: unknown, val: unknown) => ({ op: 'eq', col, val })),
    and: vi.fn((...args: unknown[]) => ({ op: 'and', args })),
    ilike: vi.fn((col: unknown, val: unknown) => ({ op: 'ilike', col, val })),
    or: vi.fn((...args: unknown[]) => ({ op: 'or', args })),
  };
});

describe('searchKnowledgeBase', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns results for given tenantId', async () => {
    const { searchKnowledgeBase } = await import('../search-knowledge-base.js');
    const results = await searchKnowledgeBase('11111111-1111-4111-8111-111111111111', { tenantId: '11111111-1111-4111-8111-111111111111' });
    expect(Array.isArray(results)).toBe(true);
  });

  it('filters by tipo=objecao', async () => {
    const { searchKnowledgeBase } = await import('../search-knowledge-base.js');
    const { eq } = await import('@leedi/db');
    await searchKnowledgeBase('11111111-1111-4111-8111-111111111111', { tenantId: '11111111-1111-4111-8111-111111111111', tipo: 'objecao' });
    const calls = (eq as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls.some(([, val]) => val === 'objecao')).toBe(true);
  });

  it('filters by categoria', async () => {
    const { searchKnowledgeBase } = await import('../search-knowledge-base.js');
    const { eq } = await import('@leedi/db');
    await searchKnowledgeBase('11111111-1111-4111-8111-111111111111', { tenantId: '11111111-1111-4111-8111-111111111111', categoria: 'preco' });
    const calls = (eq as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls.some(([, val]) => val === 'preco')).toBe(true);
  });

  it('returns correct shape fields', async () => {
    const { searchKnowledgeBase } = await import('../search-knowledge-base.js');
    const results = await searchKnowledgeBase('11111111-1111-4111-8111-111111111111', { tenantId: '11111111-1111-4111-8111-111111111111' });
    if (results.length > 0) {
      const [r] = results;
      expect(r).toHaveProperty('perguntaOuObjecao');
      expect(r).toHaveProperty('respostaOuContorno');
      expect(r).toHaveProperty('tipo');
      expect(r).toHaveProperty('categoria');
    }
  });
});
