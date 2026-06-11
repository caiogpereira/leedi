import { describe, it, expect, vi, beforeEach } from 'vitest';

const state = vi.hoisted(() => ({
  windowRows: [] as Record<string, unknown>[],
  inserts: [] as Record<string, unknown>[],
  publishJSON: vi.fn(async (_opts: { url: string; delay: number; body: unknown }) => ({
    messageId: 'm1',
  })),
}));

vi.mock('@upstash/qstash', () => ({
  Client: class {
    publishJSON = state.publishJSON;
  },
}));

vi.mock('@leedi/config', () => ({
  env: { QSTASH_TOKEN: 'tok', BETTER_AUTH_URL: 'http://localhost:3000', API_PORT: '3003' },
}));

vi.mock('@leedi/db', () => {
  function makeTx() {
    const b: Record<string, (...a: unknown[]) => unknown> = {};
    b.select = () => b;
    b.from = () => b;
    b.where = () => b;
    b.limit = () => state.windowRows;
    b.insert = () => ({
      values: (row: Record<string, unknown>) => {
        state.inserts.push(row);
        return { returning: () => Promise.resolve([{ id: 'followup-1' }]) };
      },
    });
    return b;
  }
  return {
    withTenant: vi.fn((_id: string, fn: (tx: unknown) => unknown) => fn(makeTx())),
    schema: { conversationWindows: { id: {}, endedAt: {}, startedAt: {}, tenantId: {} }, followups: { id: {} } },
    eq: vi.fn(),
    and: vi.fn(),
    sql: Object.assign((s: TemplateStringsArray, ...v: unknown[]) => ({ raw: s.join('?'), v }), {}),
  };
});

const ctx = { tenantId: 't1', leadId: 'lead-1', conversationWindowId: 'win-1' };

/** ISO datetime `hours` from now. */
const isoIn = (hours: number) => new Date(Date.now() + hours * 3600 * 1000).toISOString();

beforeEach(() => {
  state.windowRows = [];
  state.inserts = [];
  state.publishJSON.mockClear();
});

describe('agendarFollowup', () => {
  it('rejects an invalid datetime', async () => {
    const { agendarFollowup } = await import('../agendar-followup.js');
    const result = await agendarFollowup({ agendado_para: 'not-a-date', motivo: 'x' }, ctx);
    expect(result).toMatch(/inválida/);
    expect(state.inserts).toHaveLength(0);
  });

  it('rejects a time in the past', async () => {
    const { agendarFollowup } = await import('../agendar-followup.js');
    const result = await agendarFollowup({ agendado_para: isoIn(-1), motivo: 'x' }, ctx);
    expect(result).toBe('O follow-up deve ser agendado dentro da janela de 24 horas ativa.');
    expect(state.inserts).toHaveLength(0);
  });

  it('rejects a time beyond the active 24h window', async () => {
    const { agendarFollowup } = await import('../agendar-followup.js');
    const result = await agendarFollowup({ agendado_para: isoIn(30), motivo: 'x' }, ctx);
    expect(result).toBe('O follow-up deve ser agendado dentro da janela de 24 horas ativa.');
  });

  it('rejects when the conversation window is closed', async () => {
    state.windowRows = []; // no open window
    const { agendarFollowup } = await import('../agendar-followup.js');
    const result = await agendarFollowup({ agendado_para: isoIn(2), motivo: 'x' }, ctx);
    expect(result).toMatch(/fechada/);
    expect(state.publishJSON).not.toHaveBeenCalled();
  });

  it('inserts a followup and schedules a QStash job when the window is open', async () => {
    state.windowRows = [{ id: 'win-1', endedAt: null, startedAt: new Date() }];
    const target = isoIn(3);
    const { agendarFollowup } = await import('../agendar-followup.js');
    const result = await agendarFollowup(
      { agendado_para: target, motivo: 'lembrete', conteudoSugerido: 'oi' },
      ctx
    );
    expect(result).toContain(new Date(target).toISOString());
    expect(state.inserts[0]).toMatchObject({ motivo: 'lembrete', conteudoSugerido: 'oi', status: 'agendado' });
    expect(state.publishJSON).toHaveBeenCalledTimes(1);
    const arg = state.publishJSON.mock.calls[0]![0];
    expect(arg.url).toContain('/api/internal/dispatch/send-followup');
    // delay ≈ 3h in seconds (allow for elapsed test time).
    expect(arg.delay).toBeGreaterThan(3 * 3600 - 60);
    expect(arg.delay).toBeLessThanOrEqual(3 * 3600);
  });
});
