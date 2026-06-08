import { describe, it, expect, vi, beforeEach } from 'vitest';

const state = vi.hoisted(() => ({
  rules: [] as Record<string, unknown>[],
  publishJSON: vi.fn(
    async (_opts: { url: string; delay: number; body: { dispatchRuleId: string } }) => ({
      messageId: 'm1',
    })
  ),
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
    b.limit = () => state.rules;
    return b;
  }
  return {
    withTenant: vi.fn((_id: string, fn: (tx: unknown) => unknown) => fn(makeTx())),
    schema: { dispatchRules: { id: {}, ativo: {}, tenantId: {} } },
    eq: vi.fn(),
    and: vi.fn(),
  };
});

const ctx = { tenantId: 't1', leadId: 'lead-1' };

beforeEach(() => {
  state.rules = [];
  state.publishJSON.mockClear();
});

describe('solicitarReengajamento', () => {
  it('returns an error message when no active rule exists', async () => {
    state.rules = [];
    const { solicitarReengajamento } = await import('../solicitar-reengajamento.js');
    const result = await solicitarReengajamento({ motivo: 'frio' }, ctx);
    expect(result).toMatch(/nenhuma regra/i);
    expect(state.publishJSON).not.toHaveBeenCalled();
  });

  it('enqueues a recovery target when an active rule exists', async () => {
    state.rules = [{ id: 'rule-1' }];
    const { solicitarReengajamento } = await import('../solicitar-reengajamento.js');
    const result = await solicitarReengajamento({ motivo: 'frio' }, ctx);
    expect(result).toMatch(/Reengajamento solicitado/);
    expect(state.publishJSON).toHaveBeenCalledTimes(1);
    const arg = state.publishJSON.mock.calls[0]![0];
    expect(arg.url).toContain('/api/internal/gateway/dispatch-recovery-target');
    expect(arg.body.dispatchRuleId).toBe('rule-1');
  });
});
