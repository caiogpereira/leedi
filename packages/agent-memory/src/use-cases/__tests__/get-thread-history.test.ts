import { describe, it, expect, vi, beforeEach } from 'vitest';

// The role-mapping transform in getThreadHistory is load-bearing: the Anthropic
// `messages` array only accepts user/assistant, so the persisted `system` row
// must be dropped and `tool` rows must map to a user turn. Getting this wrong
// 400s the API. We mock @leedi/db to feed canned rows through the transform.

const rows = vi.hoisted(() => ({ data: [] as Array<{ role: string; content: unknown }> }));

vi.mock('@leedi/db', () => {
  const builder: Record<string, (...a: unknown[]) => unknown> = {};
  const chain = () => builder;
  builder.select = chain;
  builder.from = chain;
  builder.where = chain;
  builder.orderBy = () => rows.data;
  return {
    withTenant: async (_t: string, fn: (tx: unknown) => Promise<unknown>) => fn(builder),
    schema: { agentMessages: { tenantId: {}, threadId: {}, role: {}, content: {}, createdAt: {} } },
    eq: () => ({}),
    and: () => ({}),
    sql: (s: unknown) => s,
  };
});

import { getThreadHistory } from '../get-thread-history.js';

beforeEach(() => {
  rows.data = [];
});

describe('getThreadHistory', () => {
  it('filters out the audit-only system row', async () => {
    rows.data = [
      { role: 'system', content: 'PERSONA...' },
      { role: 'user', content: 'oi' },
      { role: 'assistant', content: [{ type: 'text', text: 'olá' }] },
    ];
    const history = await getThreadHistory('t1', 'th1');
    expect(history).toHaveLength(2);
    expect(history.find((m) => (m as { role: string }).role === 'system')).toBeUndefined();
  });

  it('maps the persisted tool role to a user turn', async () => {
    rows.data = [
      { role: 'assistant', content: [{ type: 'tool_use', id: 'tu1', name: 'x', input: {} }] },
      { role: 'tool', content: [{ type: 'tool_result', tool_use_id: 'tu1', content: '{}' }] },
    ];
    const history = await getThreadHistory('t1', 'th1');
    expect(history).toHaveLength(2);
    expect(history[1]!.role).toBe('user');
    expect(history[1]!.content).toEqual([{ type: 'tool_result', tool_use_id: 'tu1', content: '{}' }]);
  });

  it('preserves user/assistant rows verbatim and in order', async () => {
    rows.data = [
      { role: 'user', content: 'a' },
      { role: 'assistant', content: 'b' },
      { role: 'user', content: 'c' },
    ];
    const history = await getThreadHistory('t1', 'th1');
    expect(history.map((m) => m.role)).toEqual(['user', 'assistant', 'user']);
    expect(history.map((m) => m.content)).toEqual(['a', 'b', 'c']);
  });
});
