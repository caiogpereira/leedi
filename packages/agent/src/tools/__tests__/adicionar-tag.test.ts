import { describe, it, expect, vi, beforeEach } from 'vitest';

const state = vi.hoisted(() => ({
  existing: undefined as Record<string, unknown> | undefined,
  inserts: [] as Record<string, unknown>[],
  // captures the args passed to anthropic.messages.create
  createMock: vi.fn(async (_params: { model: string }) => ({
    content: [{ type: 'text', text: 'lead quente' }],
  })),
}));

vi.mock('@leedi/db', () => {
  function makeTx() {
    const b: Record<string, (...a: unknown[]) => unknown> = {};
    b.select = () => b;
    b.from = () => b;
    b.where = () => b;
    b.limit = () => (state.existing ? [state.existing] : []);
    b.insert = () => ({
      values: (row: Record<string, unknown>) => {
        state.inserts.push(row);
        return Promise.resolve();
      },
    });
    return b;
  }
  return {
    withTenant: vi.fn((_id: string, fn: (tx: unknown) => unknown) => fn(makeTx())),
    schema: { leadTags: { _marker: 'leadTags' } },
    eq: vi.fn(),
    and: vi.fn(),
  };
});

vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn(function (this: { messages: { create: typeof state.createMock } }) {
    this.messages = { create: state.createMock };
  }),
}));

const ctx = { tenantId: 't1', leadId: 'lead-1' };

describe('adicionarTag', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.existing = undefined;
    state.inserts = [];
    state.createMock = vi.fn(async (_params: { model: string }) => ({
      content: [{ type: 'text', text: 'lead quente' }],
    }));
  });

  it("inserts the tag with origem_tag='agente' (AC#3)", async () => {
    const { adicionarTag } = await import('../adicionar-tag.js');
    const res = await adicionarTag({ tagText: 'interessado' }, ctx);

    expect(state.inserts).toHaveLength(1);
    expect(state.inserts[0]).toMatchObject({
      tenantId: 't1',
      leadId: 'lead-1',
      tag: 'interessado',
      origemTag: 'agente',
    });
    expect(res).toEqual({ tagged: true, tag: 'interessado' });
  });

  it('is idempotent — no duplicate insert when the tag already exists (AC#4)', async () => {
    state.existing = { id: 'tag-1' };
    const { adicionarTag } = await import('../adicionar-tag.js');
    const res = await adicionarTag({ tagText: 'interessado' }, ctx);

    expect(state.inserts).toHaveLength(0);
    expect(res).toEqual({ tagged: true, tag: 'interessado' });
  });

  it('classifies with Claude Haiku when conversationContext is provided (AC#5)', async () => {
    const { adicionarTag } = await import('../adicionar-tag.js');
    const Anthropic = (await import('@anthropic-ai/sdk')).default;

    const res = await adicionarTag(
      { tagText: 'interesse', conversationContext: 'lead disse que quer comprar agora' },
      ctx
    );

    expect(Anthropic).toHaveBeenCalled();
    expect(state.createMock).toHaveBeenCalledTimes(1);
    const callArgs = state.createMock.mock.calls[0]![0];
    expect(callArgs.model).toBe('claude-haiku-4-5-20251001');
    // refined tag (from Haiku) is what gets stored
    expect(state.inserts[0]).toMatchObject({ tag: 'lead quente', origemTag: 'agente' });
    expect(res).toEqual({ tagged: true, tag: 'lead quente' });
  });

  it('deduplicates on the refined tag when context is provided', async () => {
    state.existing = { id: 'tag-1' };
    const { adicionarTag } = await import('../adicionar-tag.js');
    const res = await adicionarTag(
      { tagText: 'interesse', conversationContext: 'comprar agora' },
      ctx
    );
    expect(state.inserts).toHaveLength(0);
    expect(res).toEqual({ tagged: true, tag: 'lead quente' });
  });
});
