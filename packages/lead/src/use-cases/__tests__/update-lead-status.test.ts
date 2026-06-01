import { describe, expect, it, vi, beforeEach } from 'vitest';

/**
 * Mock @leedi/db. updateLeadStatus, inside ONE withTenant callback, runs:
 *   tx.update(leads).set({...}).where(...).returning({ id }) -> [{ id }] | []
 *   tx.insert(lead_journey_events).values({...})              (only if update matched)
 *
 * The mock records the `tx` instance handed to each of update() and insert() so
 * the test can assert both operations executed against the SAME transaction
 * (the data-integrity guarantee of AC3/AC5). `updateReturns` drives whether the
 * UPDATE matched a row.
 */
let updateReturns: Array<{ id: string }> = [];
const updateTxRefs: unknown[] = [];
const insertTxRefs: unknown[] = [];
const updateSets: unknown[] = [];
const insertedValues: unknown[] = [];

function makeTx() {
  const tx: Record<string, unknown> = {};

  tx.update = () => {
    updateTxRefs.push(tx);
    const chain: Record<string, unknown> = {};
    chain.set = (v: unknown) => {
      updateSets.push(v);
      return chain;
    };
    chain.where = () => chain;
    chain.returning = () => Promise.resolve(updateReturns);
    return chain;
  };

  tx.insert = () => {
    insertTxRefs.push(tx);
    const chain: Record<string, unknown> = {};
    chain.values = (v: unknown) => {
      insertedValues.push(v);
      return Promise.resolve(undefined);
    };
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
      leads: { id: 'leads.id', tenantId: 'leads.tenant_id', status: 'leads.status' },
      leadJourneyEvents: { id: 'lead_journey_events.id' },
    },
    eq: vi.fn((col: unknown, val: unknown) => ({ op: 'eq', col, val })),
    and: vi.fn((...args: unknown[]) => ({ op: 'and', args })),
    sql: vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => ({
      op: 'sql',
      strings: Array.from(strings),
      values,
    })),
  };
});

const VALID_UUID = '11111111-1111-1111-1111-111111111111';

describe('updateLeadStatus', () => {
  beforeEach(() => {
    updateReturns = [{ id: 'lead-1' }];
    updateTxRefs.length = 0;
    insertTxRefs.length = 0;
    updateSets.length = 0;
    insertedValues.length = 0;
    vi.clearAllMocks();
  });

  it('optout: sets status and records an optout journey event with manual origin + operador', async () => {
    const { updateLeadStatus } = await import('../update-lead-status.js');

    const ok = await updateLeadStatus({
      tenantId: 'tenant-1',
      leadId: VALID_UUID,
      status: 'optout',
      operadorId: 'user-9',
    });

    expect(ok).toBe(true);

    // status flipped to optout
    expect(updateSets[0]).toMatchObject({ status: 'optout' });

    // journey event shape
    expect(insertedValues[0]).toMatchObject({
      leadId: VALID_UUID,
      tenantId: 'tenant-1',
      tipo: 'optout',
      detalhes: { origem: 'manual', operador_id: 'user-9' },
    });
  });

  it('reativado: sets status ativo and records a reativado event with operador only', async () => {
    const { updateLeadStatus } = await import('../update-lead-status.js');

    const ok = await updateLeadStatus({
      tenantId: 'tenant-1',
      leadId: VALID_UUID,
      status: 'ativo',
      operadorId: 'user-9',
    });

    expect(ok).toBe(true);
    expect(updateSets[0]).toMatchObject({ status: 'ativo' });
    expect(insertedValues[0]).toMatchObject({
      tipo: 'reativado',
      detalhes: { operador_id: 'user-9' },
    });
    // reativado carries no `origem`.
    expect((insertedValues[0] as { detalhes: Record<string, unknown> }).detalhes).not.toHaveProperty(
      'origem'
    );
  });

  it('runs the status update and the journey insert in the SAME transaction', async () => {
    const { updateLeadStatus } = await import('../update-lead-status.js');

    await updateLeadStatus({
      tenantId: 'tenant-1',
      leadId: VALID_UUID,
      status: 'optout',
      operadorId: 'user-9',
    });

    expect(updateTxRefs).toHaveLength(1);
    expect(insertTxRefs).toHaveLength(1);
    // Same tx object reference => one transaction.
    expect(updateTxRefs[0]).toBe(insertTxRefs[0]);
  });

  it('never derives operador from anywhere but the input (no body leakage)', async () => {
    const { updateLeadStatus } = await import('../update-lead-status.js');

    await updateLeadStatus({
      tenantId: 'tenant-1',
      leadId: VALID_UUID,
      status: 'optout',
      operadorId: 'the-session-user',
    });

    expect(
      (insertedValues[0] as { detalhes: { operador_id: string } }).detalhes.operador_id
    ).toBe('the-session-user');
  });

  it('returns false without querying for a malformed (non-UUID) leadId', async () => {
    const { updateLeadStatus } = await import('../update-lead-status.js');
    const { withTenant } = await import('@leedi/db');

    const ok = await updateLeadStatus({
      tenantId: 'tenant-1',
      leadId: 'not-a-uuid',
      status: 'optout',
      operadorId: 'user-9',
    });

    expect(ok).toBe(false);
    expect(withTenant).not.toHaveBeenCalled();
  });

  it('returns false and writes NO journey event when the lead does not exist', async () => {
    const { updateLeadStatus } = await import('../update-lead-status.js');

    updateReturns = []; // UPDATE matched no row

    const ok = await updateLeadStatus({
      tenantId: 'tenant-1',
      leadId: '22222222-2222-2222-2222-222222222222',
      status: 'optout',
      operadorId: 'user-9',
    });

    expect(ok).toBe(false);
    expect(insertedValues).toHaveLength(0);
  });
});
