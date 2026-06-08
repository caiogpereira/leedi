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

beforeEach(() => {
  state.windowRows = [];
  state.inserts = [];
  state.publishJSON.mockClear();
});

describe('agendarFollowup', () => {
  it('rejects emHoras <= 0', async () => {
    const { agendarFollowup } = await import('../agendar-followup.js');
    const result = await agendarFollowup({ emHoras: 0, motivo: 'x' }, ctx);
    expect(result).toMatch(/positivo/);
    expect(state.inserts).toHaveLength(0);
  });

  it('rejects emHoras > 23', async () => {
    const { agendarFollowup } = await import('../agendar-followup.js');
    const result = await agendarFollowup({ emHoras: 30, motivo: 'x' }, ctx);
    expect(result).toMatch(/23 horas/);
  });

  it('rejects when the conversation window is closed', async () => {
    state.windowRows = []; // no open window
    const { agendarFollowup } = await import('../agendar-followup.js');
    const result = await agendarFollowup({ emHoras: 2, motivo: 'x' }, ctx);
    expect(result).toMatch(/fechada/);
    expect(state.publishJSON).not.toHaveBeenCalled();
  });

  it('inserts a followup and schedules a QStash job when the window is open', async () => {
    state.windowRows = [{ id: 'win-1', endedAt: null, startedAt: new Date() }];
    const { agendarFollowup } = await import('../agendar-followup.js');
    const result = await agendarFollowup({ emHoras: 3, motivo: 'lembrete', conteudoSugerido: 'oi' }, ctx);
    expect(result).toMatch(/3 hora/);
    expect(state.inserts[0]).toMatchObject({ motivo: 'lembrete', conteudoSugerido: 'oi', status: 'agendado' });
    expect(state.publishJSON).toHaveBeenCalledTimes(1);
    const arg = state.publishJSON.mock.calls[0]![0];
    expect(arg.url).toContain('/api/internal/dispatch/send-followup');
    expect(arg.delay).toBe(3 * 3600);
  });
});
