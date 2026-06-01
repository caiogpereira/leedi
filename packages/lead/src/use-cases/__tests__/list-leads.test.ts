import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

/**
 * Mock @leedi/db. The use case issues two queries inside one withTenant call:
 *   list:  tx.select().from().where().orderBy().limit().offset()  -> rows
 *   count: tx.select().from().where()                              -> [{ count }]
 *
 * We distinguish them by whether `.orderBy()` was called on the chain. Each builder
 * call captures the WHERE argument so tests can assert filters were applied.
 */
const whereCalls: unknown[] = [];
const listRows: unknown[] = [];
let countValue = 0;

function makeChain() {
  let ordered = false;
  const chain: Record<string, unknown> = {};
  const step = () => chain;
  chain.from = step;
  chain.where = (arg: unknown) => {
    whereCalls.push(arg);
    return chain;
  };
  chain.orderBy = () => {
    ordered = true;
    return chain;
  };
  chain.limit = step;
  chain.offset = step;
  // Thenable: list query awaits after .offset(); count query awaits after .where().
  chain.then = (resolve: (v: unknown) => unknown) => {
    return Promise.resolve(ordered ? listRows : [{ count: countValue }]).then(resolve);
  };
  return chain;
}

vi.mock('@leedi/db', () => {
  return {
    withTenant: vi.fn(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (_tenantId: string, fn: (tx: any) => Promise<unknown>) => fn({ select: () => makeChain() })
    ),
    schema: {
      leads: {
        id: 'leads.id',
        tenantId: 'leads.tenant_id',
        telefone: 'leads.telefone',
        nome: 'leads.nome',
        email: 'leads.email',
        origem: 'leads.origem',
        temperatura: 'leads.temperatura',
        status: 'leads.status',
        comprou: 'leads.comprou',
        ultimaInteracao: 'leads.ultima_interacao',
        createdAt: 'leads.created_at',
      },
    },
    eq: vi.fn((col: unknown, val: unknown) => ({ op: 'eq', col, val })),
    and: vi.fn((...args: unknown[]) => ({ op: 'and', args })),
    or: vi.fn((...args: unknown[]) => ({ op: 'or', args })),
    ilike: vi.fn((col: unknown, val: unknown) => ({ op: 'ilike', col, val })),
    sql: Object.assign(
      vi.fn(() => ({ op: 'sql' })),
      {}
    ),
  };
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function flatten(node: any): any[] {
  if (!node || typeof node !== 'object') return [];
  const out = [node];
  if (Array.isArray(node.args)) {
    for (const a of node.args) out.push(...flatten(a));
  }
  return out;
}

describe('listLeads', () => {
  beforeEach(() => {
    whereCalls.length = 0;
    listRows.length = 0;
    countValue = 0;
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns leads for the specified tenant', async () => {
    const { listLeads } = await import('../list-leads.js');
    const { withTenant } = await import('@leedi/db');

    listRows.push({ id: 'l1', telefone: '+5511999999999', nome: 'Ana' });
    countValue = 1;

    const result = await listLeads({ tenantId: 'tenant-1' });

    expect(withTenant).toHaveBeenCalledWith('tenant-1', expect.any(Function));
    expect(result.leads).toHaveLength(1);
    expect(result.total).toBe(1);
  });

  it('applies the temperatura filter', async () => {
    const { listLeads } = await import('../list-leads.js');
    await listLeads({ tenantId: 'tenant-1', temperatura: 'quente' });

    const conditions = flatten(whereCalls[0]);
    expect(
      conditions.some((c) => c.op === 'eq' && c.col === 'leads.temperatura' && c.val === 'quente')
    ).toBe(true);
  });

  it('applies the status filter', async () => {
    const { listLeads } = await import('../list-leads.js');
    await listLeads({ tenantId: 'tenant-1', status: 'optout' });

    const conditions = flatten(whereCalls[0]);
    expect(
      conditions.some((c) => c.op === 'eq' && c.col === 'leads.status' && c.val === 'optout')
    ).toBe(true);
  });

  it('applies the search filter (nome ILIKE)', async () => {
    const { listLeads } = await import('../list-leads.js');
    await listLeads({ tenantId: 'tenant-1', search: 'Maria' });

    const conditions = flatten(whereCalls[0]);
    const ilikeNome = conditions.find((c) => c.op === 'ilike' && c.col === 'leads.nome');
    expect(ilikeNome).toBeTruthy();
    expect(ilikeNome.val).toBe('%Maria%');
  });

  it('enforces pageSize max of 100', async () => {
    const { listLeads } = await import('../list-leads.js');
    const result = await listLeads({ tenantId: 'tenant-1', pageSize: 5000 });
    expect(result.pageSize).toBe(100);
  });

  it('defaults to page 1 and pageSize 20', async () => {
    const { listLeads } = await import('../list-leads.js');
    const result = await listLeads({ tenantId: 'tenant-1' });
    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(20);
  });

  it('reuses the same WHERE clause for list and count queries', async () => {
    const { listLeads } = await import('../list-leads.js');
    await listLeads({ tenantId: 'tenant-1', status: 'ativo' });
    // Both list and count call .where() -> two captured, structurally equal.
    expect(whereCalls).toHaveLength(2);
    expect(whereCalls[0]).toEqual(whereCalls[1]);
  });
});
