import { describe, it, expect, vi, beforeEach } from 'vitest';

const state = vi.hoisted(() => ({
  inserts: [] as Record<string, unknown>[],
  lastConflictTarget: undefined as unknown,
  // captures the args passed to anthropic.messages.create
  createMock: vi.fn(async (_params: { model: string }) => ({
    content: [{ type: 'text', text: 'lead quente' }],
  })),
}));

vi.mock('@leedi/db', () => {
  function makeTx() {
    const b: Record<string, (...a: unknown[]) => unknown> = {};
    // Idempotency is now delegated to the DB UNIQUE constraint via
    // ON CONFLICT DO NOTHING — the insert is always issued.
    b.insert = () => ({
      values: (row: Record<string, unknown>) => {
        state.inserts.push(row);
        return {
          onConflictDoNothing: (cfg?: { target?: unknown }) => {
            state.lastConflictTarget = cfg?.target;
            return Promise.resolve();
          },
        };
      },
    });
    return b;
  }
  return {
    withTenant: vi.fn((_id: string, fn: (tx: unknown) => unknown) => fn(makeTx())),
    schema: {
      leadTags: {
        tenantId: 'lead_tags.tenant_id',
        leadId: 'lead_tags.lead_id',
        tag: 'lead_tags.tag',
      },
    },
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
    state.inserts = [];
    state.lastConflictTarget = undefined;
    state.createMock = vi.fn(async (_params: { model: string }) => ({
      content: [{ type: 'text', text: 'lead quente' }],
    }));
  });

  it("inserts the tag with origem_tag='agente', guarded by ON CONFLICT (AC#3/AC#4)", async () => {
    const { adicionarTag } = await import('../adicionar-tag.js');
    const res = await adicionarTag({ tagText: 'interessado' }, ctx);

    expect(state.inserts).toHaveLength(1);
    expect(state.inserts[0]).toMatchObject({
      tenantId: 't1',
      leadId: 'lead-1',
      tag: 'interessado',
      origemTag: 'agente',
    });
    // AC#4 — idempotency delegated to the DB UNIQUE (tenant_id, lead_id, tag)
    // constraint via ON CONFLICT DO NOTHING (PL-12).
    expect(state.lastConflictTarget).toEqual([
      'lead_tags.tenant_id',
      'lead_tags.lead_id',
      'lead_tags.tag',
    ]);
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

  it('guards the refined-tag insert with ON CONFLICT DO NOTHING (AC#4)', async () => {
    const { adicionarTag } = await import('../adicionar-tag.js');
    const res = await adicionarTag(
      { tagText: 'interesse', conversationContext: 'comprar agora' },
      ctx
    );
    expect(state.inserts).toHaveLength(1);
    expect(state.inserts[0]).toMatchObject({ tag: 'lead quente', origemTag: 'agente' });
    expect(state.lastConflictTarget).toEqual([
      'lead_tags.tenant_id',
      'lead_tags.lead_id',
      'lead_tags.tag',
    ]);
    expect(res).toEqual({ tagged: true, tag: 'lead quente' });
  });
});
