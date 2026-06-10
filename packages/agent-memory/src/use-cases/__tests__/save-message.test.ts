import { describe, it, expect, beforeEach, vi } from 'vitest';

// Cost math in saveMessage is load-bearing for usage/billing dashboards
// (AC#6). We mock @leedi/db to capture the values passed to insert().values()
// and assert the computed custo_usd.

const captured = vi.hoisted(() => ({ values: undefined as Record<string, unknown> | undefined }));

vi.mock('@leedi/db', () => {
  const builder: Record<string, (...a: unknown[]) => unknown> = {};
  builder.insert = () => builder;
  builder.values = (vals: unknown) => {
    captured.values = vals as Record<string, unknown>;
    return builder;
  };
  builder.returning = () => [{ id: 'msg-1' }];
  return {
    withTenant: async (_t: string, fn: (tx: unknown) => Promise<unknown>) => fn(builder),
    schema: { agentMessages: { id: {} } },
  };
});

import { saveMessage } from '../save-message.js';

beforeEach(() => {
  captured.values = undefined;
});

describe('saveMessage cost calculation', () => {
  it('computes custo_usd for a Sonnet assistant turn', async () => {
    await saveMessage({
      tenantId: 't1',
      threadId: 'th1',
      role: 'assistant',
      content: [{ type: 'text', text: 'olá' }],
      tokensInput: 1000,
      tokensOutput: 500,
      modelo: 'claude-sonnet-4-6',
    });
    // 1000 * 3/1e6 + 500 * 15/1e6 = 0.003 + 0.0075 = 0.0105
    expect(Number(captured.values!.custoUsd)).toBeCloseTo(0.0105, 12);
    expect(captured.values!.tokensInput).toBe(1000);
    expect(captured.values!.tokensOutput).toBe(500);
    expect(captured.values!.modelo).toBe('claude-sonnet-4-6');
  });

  it('computes custo_usd for the Haiku id with the date suffix', async () => {
    await saveMessage({
      tenantId: 't1',
      threadId: 'th1',
      role: 'assistant',
      content: 'x',
      tokensInput: 2000,
      tokensOutput: 1000,
      modelo: 'claude-haiku-4-5-20251001',
    });
    // 2000 * 1/1e6 + 1000 * 5/1e6 = 0.002 + 0.005 = 0.007
    expect(Number(captured.values!.custoUsd)).toBeCloseTo(0.007, 12);
  });

  it('computes custo_usd for an Opus assistant turn', async () => {
    await saveMessage({
      tenantId: 't1',
      threadId: 'th1',
      role: 'assistant',
      content: 'x',
      tokensInput: 100,
      tokensOutput: 200,
      modelo: 'claude-opus-4-8',
    });
    // 100 * 5/1e6 + 200 * 25/1e6 = 0.0005 + 0.005 = 0.0055
    expect(Number(captured.values!.custoUsd)).toBeCloseTo(0.0055, 12);
  });

  it('leaves custo_usd null when no model id is provided', async () => {
    await saveMessage({
      tenantId: 't1',
      threadId: 'th1',
      role: 'user',
      content: 'oi',
    });
    expect(captured.values!.custoUsd).toBeNull();
  });

  it('leaves custo_usd null for an unrecognized model id', async () => {
    await saveMessage({
      tenantId: 't1',
      threadId: 'th1',
      role: 'assistant',
      content: 'x',
      tokensInput: 10,
      tokensOutput: 10,
      modelo: 'gpt-4o',
    });
    expect(captured.values!.custoUsd).toBeNull();
  });

  it('respects an explicitly-passed custoUsd', async () => {
    await saveMessage({
      tenantId: 't1',
      threadId: 'th1',
      role: 'assistant',
      content: 'x',
      tokensInput: 1000,
      tokensOutput: 500,
      modelo: 'claude-sonnet-4-6',
      custoUsd: '9.99',
    });
    expect(captured.values!.custoUsd).toBe('9.99');
  });
});
