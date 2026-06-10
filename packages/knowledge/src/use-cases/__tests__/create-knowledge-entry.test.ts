import { describe, it, expect, vi, beforeEach } from 'vitest';

// Story 6.3 AC#1 — create-knowledge-entry validates required fields.
vi.mock('@leedi/db', () => {
  const returning = vi.fn().mockResolvedValue([
    {
      id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      tenantId: '11111111-1111-4111-8111-111111111111',
      tipo: 'faq',
      perguntaOuObjecao: 'Qual o prazo de entrega?',
      respostaOuContorno: 'Acesso imediato após a compra.',
      categoria: null,
      ativo: true,
    },
  ]);
  const values = vi.fn().mockReturnValue({ returning });
  const insert = vi.fn().mockReturnValue({ values });
  const tx = { insert };
  return {
    withTenant: vi.fn((_id: string, fn: (t: typeof tx) => unknown) => fn(tx)),
    schema: {
      knowledgeBase: {
        tenantId: 'kb.tenant_id',
      },
    },
    eq: vi.fn(),
    and: vi.fn(),
  };
});

describe('createKnowledgeEntry', () => {
  beforeEach(() => vi.clearAllMocks());

  it('creates a faq entry successfully', async () => {
    const { createKnowledgeEntry } = await import('../create-knowledge-entry.js');
    const result = await createKnowledgeEntry({
      tenantId: '11111111-1111-4111-8111-111111111111',
      tipo: 'faq',
      perguntaOuObjecao: 'Qual o prazo de entrega?',
      respostaOuContorno: 'Acesso imediato após a compra.',
    });
    expect(result.tipo).toBe('faq');
    expect(result.ativo).toBe(true);
  });

  it('rejects an empty perguntaOuObjecao', async () => {
    const { createKnowledgeEntry, KnowledgeValidationError } = await import(
      '../create-knowledge-entry.js'
    );
    await expect(
      createKnowledgeEntry({
        tenantId: '11111111-1111-4111-8111-111111111111',
        tipo: 'faq',
        perguntaOuObjecao: '',
        respostaOuContorno: 'Resposta válida',
      })
    ).rejects.toThrow(KnowledgeValidationError);
  });

  it('rejects an empty respostaOuContorno', async () => {
    const { createKnowledgeEntry, KnowledgeValidationError } = await import(
      '../create-knowledge-entry.js'
    );
    await expect(
      createKnowledgeEntry({
        tenantId: '11111111-1111-4111-8111-111111111111',
        tipo: 'objecao',
        perguntaOuObjecao: 'É muito caro',
        respostaOuContorno: '',
      })
    ).rejects.toThrow(KnowledgeValidationError);
  });

  it('rejects an invalid tipo', async () => {
    const { createKnowledgeEntry, KnowledgeValidationError } = await import(
      '../create-knowledge-entry.js'
    );
    await expect(
      createKnowledgeEntry({
        tenantId: '11111111-1111-4111-8111-111111111111',
        // @ts-expect-error — invalid tipo on purpose to assert runtime validation
        tipo: 'invalido',
        perguntaOuObjecao: 'Pergunta',
        respostaOuContorno: 'Resposta',
      })
    ).rejects.toThrow(KnowledgeValidationError);
  });
});
