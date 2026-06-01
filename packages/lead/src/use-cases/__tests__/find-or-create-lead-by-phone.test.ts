import { describe, expect, it, vi, beforeEach } from 'vitest';

/**
 * Mock @leedi/db. findOrCreateLeadByPhone, inside ONE withTenant callback:
 *   tx.select(...).from(...).where(...).limit(1)                       -> selectReturns
 *   (if empty) tx.insert(...).values({...}).onConflictDoNothing().returning(...) -> insertReturns
 *   (if insert lost the race) tx.select(...).from(...).where(...).limit(1)       -> selectReturns (2nd call)
 *
 * selectQueue lets a test return different rows on successive SELECTs.
 */
let selectQueue: Array<Array<{ id: string; telefone: string }>> = [];
let insertReturns: Array<{ id: string; telefone: string }> = [];
const insertedValues: unknown[] = [];

function nextSelect(): Array<{ id: string; telefone: string }> {
  return selectQueue.length > 0 ? selectQueue.shift()! : [];
}

function makeTx() {
  const tx: Record<string, unknown> = {};

  tx.select = () => {
    const chain: Record<string, unknown> = {};
    chain.from = () => chain;
    chain.where = () => chain;
    chain.limit = () => Promise.resolve(nextSelect());
    return chain;
  };

  tx.insert = () => {
    const chain: Record<string, unknown> = {};
    chain.values = (v: unknown) => {
      insertedValues.push(v);
      return chain;
    };
    chain.onConflictDoNothing = () => chain;
    chain.returning = () => Promise.resolve(insertReturns);
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
    leads: { id: 'leads.id', tenantId: 'leads.tenant_id', telefone: 'leads.telefone' },
  },
  eq: vi.fn((col: unknown, val: unknown) => ({ op: 'eq', col, val })),
  and: vi.fn((...args: unknown[]) => ({ op: 'and', args })),
}));

describe('findOrCreateLeadByPhone', () => {
  beforeEach(() => {
    selectQueue = [];
    insertReturns = [];
    insertedValues.length = 0;
    vi.clearAllMocks();
  });

  it('returns the existing lead with isNew: false', async () => {
    const { findOrCreateLeadByPhone } = await import('../find-or-create-lead-by-phone.js');

    selectQueue = [[{ id: 'lead-existing', telefone: '+5511999999999' }]];

    const result = await findOrCreateLeadByPhone({
      tenantId: 'tenant-1',
      telefone: '+5511999999999',
    });

    expect(result).toEqual({ id: 'lead-existing', telefone: '+5511999999999', isNew: false });
    // No insert attempted.
    expect(insertedValues).toHaveLength(0);
  });

  it('creates a new lead with isNew: true and default origem whatsapp_inbound', async () => {
    const { findOrCreateLeadByPhone } = await import('../find-or-create-lead-by-phone.js');

    selectQueue = [[]]; // no existing lead
    insertReturns = [{ id: 'lead-new', telefone: '+5511888888888' }];

    const result = await findOrCreateLeadByPhone({
      tenantId: 'tenant-1',
      telefone: '+5511888888888',
    });

    expect(result).toEqual({ id: 'lead-new', telefone: '+5511888888888', isNew: true });
    expect(insertedValues[0]).toMatchObject({
      tenantId: 'tenant-1',
      telefone: '+5511888888888',
      status: 'ativo',
      temperatura: 'frio',
      origem: 'whatsapp_inbound',
      comprou: false,
      leadRecorrente: false,
      qualificacao: {},
    });
  });

  it('honours a custom origem when provided', async () => {
    const { findOrCreateLeadByPhone } = await import('../find-or-create-lead-by-phone.js');

    selectQueue = [[]];
    insertReturns = [{ id: 'lead-new', telefone: '+5511777777777' }];

    await findOrCreateLeadByPhone({
      tenantId: 'tenant-1',
      telefone: '+5511777777777',
      origem: 'import',
    });

    expect(insertedValues[0]).toMatchObject({ origem: 'import' });
  });

  it('re-selects and returns isNew: false when the insert lost a race', async () => {
    const { findOrCreateLeadByPhone } = await import('../find-or-create-lead-by-phone.js');

    // 1st SELECT: empty -> attempt insert. Insert returns nothing (conflict).
    // 2nd SELECT: the row created by the concurrent winner.
    selectQueue = [[], [{ id: 'lead-raced', telefone: '+5511666666666' }]];
    insertReturns = [];

    const result = await findOrCreateLeadByPhone({
      tenantId: 'tenant-1',
      telefone: '+5511666666666',
    });

    expect(result).toEqual({ id: 'lead-raced', telefone: '+5511666666666', isNew: false });
  });
});
