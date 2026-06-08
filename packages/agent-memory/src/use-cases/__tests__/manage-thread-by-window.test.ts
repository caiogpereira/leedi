import { describe, it, expect, vi, beforeEach } from 'vitest';

const updateSets: unknown[] = [];
const selectReturns: Array<{ id: string }> = [];

function makeTx() {
  return {
    select: () => ({
      from: () => ({
        where: () => ({
          orderBy: () => ({
            limit: () => Promise.resolve(selectReturns),
          }),
        }),
      }),
    }),
    update: () => ({
      set: (v: unknown) => {
        updateSets.push(v);
        return { where: () => Promise.resolve(undefined) };
      },
    }),
  };
}

vi.mock('@leedi/db', () => ({
  withTenant: vi.fn((_tenantId: string, fn: (tx: ReturnType<typeof makeTx>) => unknown) => fn(makeTx())),
  schema: {
    agentThreads: {
      id: 'agent_threads.id',
      tenantId: 'agent_threads.tenant_id',
      conversationWindowId: 'agent_threads.conversation_window_id',
      status: 'agent_threads.status',
      createdAt: 'agent_threads.created_at',
    },
  },
  eq: vi.fn((col: unknown, val: unknown) => ({ op: 'eq', col, val })),
  and: vi.fn((...args: unknown[]) => ({ op: 'and', args })),
}));

import {
  pauseThreadByWindowId,
  resumeThreadByWindowId,
  closeThreadByWindowId,
} from '../manage-thread-by-window.js';

describe('manage-thread-by-window', () => {
  beforeEach(() => {
    updateSets.length = 0;
    selectReturns.length = 0;
    vi.clearAllMocks();
  });

  it('pauseThreadByWindowId sets status to pausado when thread exists', async () => {
    selectReturns.push({ id: 'thread-1' });
    await pauseThreadByWindowId('tenant-1', 'window-1');
    expect(updateSets[0]).toMatchObject({ status: 'pausado' });
    expect((updateSets[0] as { updatedAt: Date }).updatedAt).toBeInstanceOf(Date);
  });

  it('resumeThreadByWindowId sets status to ativo when thread exists', async () => {
    selectReturns.push({ id: 'thread-1' });
    await resumeThreadByWindowId('tenant-1', 'window-1');
    expect(updateSets[0]).toMatchObject({ status: 'ativo' });
  });

  it('closeThreadByWindowId sets status to encerrado when thread exists', async () => {
    selectReturns.push({ id: 'thread-1' });
    await closeThreadByWindowId('tenant-1', 'window-1');
    expect(updateSets[0]).toMatchObject({ status: 'encerrado' });
  });

  it('no-ops silently when no thread exists for the window', async () => {
    // selectReturns is empty — no thread
    await expect(pauseThreadByWindowId('tenant-1', 'window-no-thread')).resolves.not.toThrow();
    expect(updateSets).toHaveLength(0);
  });
});
