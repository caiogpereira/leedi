import { describe, it, expect, vi, beforeEach } from 'vitest';

// We assert on the SHAPE of the conditions buildSegmentConditions produces by
// mocking the Drizzle operators so each returns a tagged marker we can inspect.
// This avoids coupling the test to Drizzle's internal SQL AST.

vi.mock('@leedi/db', () => {
  const sqlFn = (strings: TemplateStringsArray, ...values: unknown[]) => ({
    op: 'sql',
    raw: strings.join('?'),
    values,
  });
  // sql.join helper used by the EXISTS subquery builder.
  (sqlFn as unknown as { join: unknown }).join = (parts: unknown[], _sep: unknown) => ({
    op: 'sql.join',
    parts,
  });

  return {
    withTenant: vi.fn((_id: string, fn: (tx: unknown) => unknown) => fn({})),
    schema: {
      leads: {
        id: { col: 'leads.id' },
        tenantId: { col: 'leads.tenant_id' },
        comprou: { col: 'leads.comprou' },
        origem: { col: 'leads.origem' },
        createdAt: { col: 'leads.created_at' },
        nome: { col: 'leads.nome' },
        telefone: { col: 'leads.telefone' },
      },
      leadTags: {
        leadId: { col: 'lead_tags.lead_id' },
        tenantId: { col: 'lead_tags.tenant_id' },
        tag: { col: 'lead_tags.tag' },
      },
    },
    eq: vi.fn((a: unknown, b: unknown) => ({ op: 'eq', a, b })),
    and: vi.fn((...args: unknown[]) => ({ op: 'and', args })),
    gte: vi.fn((a: unknown, b: unknown) => ({ op: 'gte', a, b })),
    lte: vi.fn((a: unknown, b: unknown) => ({ op: 'lte', a, b })),
    ilike: vi.fn((a: unknown, b: unknown) => ({ op: 'ilike', a, b })),
    inArray: vi.fn((a: unknown, b: unknown) => ({ op: 'inArray', a, b })),
    sql: sqlFn,
  };
});

const TENANT_ID = '11111111-1111-4111-8111-111111111111';

interface Marker {
  op: string;
  a?: { col?: string };
  b?: unknown;
  raw?: string;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('buildSegmentConditions', () => {
  it('always includes a tenantId scope on leads.tenant_id', async () => {
    const { buildSegmentConditions } = await import('../evaluate-segment.js');
    const conds = buildSegmentConditions(TENANT_ID, {}) as unknown as Marker[];
    expect(conds).toHaveLength(1);
    expect(conds[0]).toMatchObject({ op: 'eq', a: { col: 'leads.tenant_id' }, b: TENANT_ID });
  });

  it('comprou:true generates an eq on leads.comprou', async () => {
    const { buildSegmentConditions } = await import('../evaluate-segment.js');
    const conds = buildSegmentConditions(TENANT_ID, { comprou: true }) as unknown as Marker[];
    const comprouCond = conds.find((c) => c.a?.col === 'leads.comprou');
    expect(comprouCond).toMatchObject({ op: 'eq', b: true });
  });

  it('origem generates an ILIKE with substring wildcards', async () => {
    const { buildSegmentConditions } = await import('../evaluate-segment.js');
    const conds = buildSegmentConditions(TENANT_ID, { origem: 'webinar' }) as unknown as Marker[];
    const origemCond = conds.find((c) => c.op === 'ilike');
    expect(origemCond).toMatchObject({ op: 'ilike', a: { col: 'leads.origem' }, b: '%webinar%' });
  });

  it('date range generates gte + lte on leads.created_at', async () => {
    const { buildSegmentConditions } = await import('../evaluate-segment.js');
    const conds = buildSegmentConditions(TENANT_ID, {
      data_captura_inicio: '2026-01-01T00:00:00Z',
      data_captura_fim: '2026-02-01T00:00:00Z',
    }) as unknown as Marker[];
    const gteCond = conds.find((c) => c.op === 'gte');
    const lteCond = conds.find((c) => c.op === 'lte');
    expect(gteCond?.a?.col).toBe('leads.created_at');
    expect(lteCond?.a?.col).toBe('leads.created_at');
  });

  it('tag list generates an EXISTS subquery against lead_tags', async () => {
    const { buildSegmentConditions } = await import('../evaluate-segment.js');
    const conds = buildSegmentConditions(TENANT_ID, { tag: ['vip', 'quente'] }) as unknown as Marker[];
    const sqlCond = conds.find((c) => c.op === 'sql');
    expect(sqlCond?.raw).toContain('EXISTS');
    expect(sqlCond?.raw).toContain('lead_tags');
  });

  it('ignores empty tag entries (no EXISTS when all blank)', async () => {
    const { buildSegmentConditions } = await import('../evaluate-segment.js');
    const conds = buildSegmentConditions(TENANT_ID, { tag: ['', ''] }) as unknown as Marker[];
    expect(conds.find((c) => c.op === 'sql')).toBeUndefined();
    expect(conds).toHaveLength(1); // tenant scope only
  });

  it('empty filtros returns only the tenant scope (all tenant leads)', async () => {
    const { buildSegmentConditions } = await import('../evaluate-segment.js');
    const conds = buildSegmentConditions(TENANT_ID, {}) as unknown as Marker[];
    expect(conds).toHaveLength(1);
  });

  it('combines multiple filters into separate conditions', async () => {
    const { buildSegmentConditions } = await import('../evaluate-segment.js');
    const conds = buildSegmentConditions(TENANT_ID, {
      comprou: false,
      origem: 'ig',
      tag: ['novo'],
    }) as unknown as Marker[];
    // tenant scope + comprou + origem + EXISTS
    expect(conds).toHaveLength(4);
  });
});
