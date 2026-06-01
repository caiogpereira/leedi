import { describe, expect, it, vi, beforeEach } from 'vitest';

/**
 * Mock @leedi/db. resolveConversationWindow, inside ONE withTenant callback:
 *   tx.select(...).from(...).where(...).orderBy(...).limit(1) -> selectReturns
 *   then EITHER
 *     tx.update(...).set({ messageCount: sql }).where(...).returning(...) -> incReturns   (fresh)
 *   OR
 *     tx.update(...).set({ endedAt }).where(...)                                            (stale close)
 *     tx.insert(...).values(...).returning(...) -> insertReturns
 *   OR (no open window)
 *     tx.insert(...).values(...).returning(...) -> insertReturns
 *
 * The recorders let the test assert which path ran and with what values.
 */
let selectReturns: Array<{ id: string; startedAt: Date }> = [];
let incReturns: Array<{ id: string; startedAt: Date; messageCount: number; billable: boolean }> = [];
let insertReturns: Array<{ id: string; startedAt: Date; messageCount: number; billable: boolean }> =
  [];

const updateSets: unknown[] = [];
const insertedValues: unknown[] = [];

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

  tx.update = () => {
    const chain: Record<string, unknown> = {};
    chain.set = (v: unknown) => {
      updateSets.push(v);
      return chain;
    };
    // .where() may end the chain (stale close) or be followed by .returning() (increment).
    // It is awaited directly in the stale-close path, so it must be thenable.
    chain.where = () => {
      const base = Promise.resolve(undefined) as Promise<unknown> & { returning?: () => Promise<unknown> };
      base.returning = () => Promise.resolve(incReturns);
      return base;
    };
    return chain;
  };

  tx.insert = () => {
    const chain: Record<string, unknown> = {};
    chain.values = (v: unknown) => {
      insertedValues.push(v);
      return chain;
    };
    chain.returning = () => Promise.resolve(insertReturns);
    return chain;
  };

  return tx;
}

vi.mock('@leedi/db', () => {
  return {
    withTenant: vi.fn(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (_tenantId: string, fn: (tx: any) => Promise<unknown>) => fn(makeTx())
    ),
    schema: {
      conversationWindows: {
        id: 'conversation_windows.id',
        tenantId: 'conversation_windows.tenant_id',
        leadId: 'conversation_windows.lead_id',
        connectionId: 'conversation_windows.connection_id',
        startedAt: 'conversation_windows.started_at',
        endedAt: 'conversation_windows.ended_at',
        messageCount: 'conversation_windows.message_count',
        billable: 'conversation_windows.billable',
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
  };
});

const TENANT = 'tenant-1';
const LEAD = 'lead-1';
const CONN = 'conn-1';
const NOW = new Date('2026-06-01T12:00:00.000Z');

describe('resolveConversationWindow', () => {
  beforeEach(() => {
    selectReturns = [];
    incReturns = [];
    insertReturns = [];
    updateSets.length = 0;
    insertedValues.length = 0;
    vi.clearAllMocks();
  });

  it('creates a new window when none is open', async () => {
    const { resolveConversationWindow } = await import('../resolve-conversation-window.js');

    selectReturns = []; // no open window
    insertReturns = [{ id: 'win-new', startedAt: NOW, messageCount: 1, billable: true }];

    const result = await resolveConversationWindow({
      tenantId: TENANT,
      leadId: LEAD,
      connectionId: CONN,
      nowFn: () => NOW,
    });

    expect(result).toEqual({ id: 'win-new', startedAt: NOW, messageCount: 1, billable: true });
    expect(insertedValues[0]).toMatchObject({
      tenantId: TENANT,
      leadId: LEAD,
      connectionId: CONN,
      startedAt: NOW,
      messageCount: 1,
      billable: true,
    });
    // No window was closed.
    expect(updateSets).toHaveLength(0);
  });

  it('reuses the window and increments messageCount when within 24h', async () => {
    const { resolveConversationWindow } = await import('../resolve-conversation-window.js');

    const startedAt = new Date(NOW.getTime() - 60 * 60 * 1000); // 1h ago — fresh
    selectReturns = [{ id: 'win-open', startedAt }];
    incReturns = [{ id: 'win-open', startedAt, messageCount: 5, billable: true }];

    const result = await resolveConversationWindow({
      tenantId: TENANT,
      leadId: LEAD,
      connectionId: CONN,
      nowFn: () => NOW,
    });

    expect(result).toEqual({ id: 'win-open', startedAt, messageCount: 5, billable: true });
    // Atomic increment: SET message_count = message_count + 1 (a sql expression, not a number).
    expect(updateSets[0]).toHaveProperty('messageCount');
    expect((updateSets[0] as { messageCount: { op: string } }).messageCount.op).toBe('sql');
    // No new window created.
    expect(insertedValues).toHaveLength(0);
  });

  it('closes the old window and creates a new one when started_at > 24h ago', async () => {
    const { resolveConversationWindow } = await import('../resolve-conversation-window.js');

    const startedAt = new Date(NOW.getTime() - 25 * 60 * 60 * 1000); // 25h ago — stale
    selectReturns = [{ id: 'win-stale', startedAt }];
    insertReturns = [{ id: 'win-fresh', startedAt: NOW, messageCount: 1, billable: true }];

    const result = await resolveConversationWindow({
      tenantId: TENANT,
      leadId: LEAD,
      connectionId: CONN,
      nowFn: () => NOW,
    });

    expect(result).toEqual({ id: 'win-fresh', startedAt: NOW, messageCount: 1, billable: true });
    // The stale window was closed (ended_at = now) before a new one opened.
    expect(updateSets[0]).toMatchObject({ endedAt: NOW });
    // And a new window was inserted.
    expect(insertedValues[0]).toMatchObject({ leadId: LEAD, messageCount: 1 });
  });

  it('sets billable: false on the new window when passed', async () => {
    const { resolveConversationWindow } = await import('../resolve-conversation-window.js');

    selectReturns = [];
    insertReturns = [{ id: 'win-new', startedAt: NOW, messageCount: 1, billable: false }];

    const result = await resolveConversationWindow({
      tenantId: TENANT,
      leadId: LEAD,
      connectionId: CONN,
      billable: false,
      nowFn: () => NOW,
    });

    expect(result.billable).toBe(false);
    expect(insertedValues[0]).toMatchObject({ billable: false });
  });
});
