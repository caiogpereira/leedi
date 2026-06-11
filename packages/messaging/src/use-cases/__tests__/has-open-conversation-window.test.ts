import { describe, expect, it, vi, beforeEach } from 'vitest';

/**
 * Mock @leedi/db. hasOpenConversationWindow, inside ONE withTenant callback:
 *   tx.select(...).from(...).where(...).orderBy(...).limit(1) -> selectReturns
 */
let selectReturns: Array<{ startedAt: Date }> = [];

function makeTx() {
  const tx: Record<string, unknown> = {};
  tx.select = () => {
    const chain: Record<string, unknown> = {};
    chain.from = () => chain;
    chain.where = () => chain;
    chain.orderBy = () => chain;
    chain.limit = () => Promise.resolve(selectReturns);
    return chain;
  };
  return tx;
}

vi.mock('@leedi/db', () => ({
  withTenant: vi.fn(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (_tenantId: string, fn: (tx: any) => Promise<unknown>) => fn(makeTx())
  ),
  schema: {
    conversationWindows: {
      leadId: 'conversation_windows.lead_id',
      tenantId: 'conversation_windows.tenant_id',
      startedAt: 'conversation_windows.started_at',
      endedAt: 'conversation_windows.ended_at',
    },
  },
  eq: vi.fn((col: unknown, val: unknown) => ({ op: 'eq', col, val })),
  and: vi.fn((...args: unknown[]) => ({ op: 'and', args })),
  isNull: vi.fn((col: unknown) => ({ op: 'isNull', col })),
  sql: vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => ({
    op: 'sql',
    strings: Array.from(strings),
    values,
  })),
}));

import { hasOpenConversationWindow } from '../has-open-conversation-window.js';

const TENANT = 'tenant-1';
const LEAD = 'lead-1';
const NOW = new Date('2026-06-01T12:00:00.000Z');

describe('hasOpenConversationWindow', () => {
  beforeEach(() => {
    selectReturns = [];
  });

  it('returns false when the lead has no open window', async () => {
    selectReturns = [];
    const result = await hasOpenConversationWindow({ tenantId: TENANT, leadId: LEAD, nowFn: () => NOW });
    expect(result).toBe(false);
  });

  it('returns true when an open window started within the last 24h', async () => {
    // started 1h ago — fresh
    selectReturns = [{ startedAt: new Date(NOW.getTime() - 60 * 60 * 1000) }];
    const result = await hasOpenConversationWindow({ tenantId: TENANT, leadId: LEAD, nowFn: () => NOW });
    expect(result).toBe(true);
  });

  it('returns false when the open window is older than 24h (stale)', async () => {
    // started 25h ago — stale, a new window would be created
    selectReturns = [{ startedAt: new Date(NOW.getTime() - 25 * 60 * 60 * 1000) }];
    const result = await hasOpenConversationWindow({ tenantId: TENANT, leadId: LEAD, nowFn: () => NOW });
    expect(result).toBe(false);
  });
});
