import { describe, it, expect, vi, beforeEach } from 'vitest';

// Operator spies live at module scope so tests can assert the exact query contract.
const ops = vi.hoisted(() => ({
  eq: vi.fn((a: unknown, b: unknown) => ({ _op: 'eq', a, b })),
  and: vi.fn((...args: unknown[]) => ({ _op: 'and', args })),
  inArray: vi.fn((a: unknown, b: unknown) => ({ _op: 'inArray', a, b })),
  gte: vi.fn((a: unknown, b: unknown) => ({ _op: 'gte', a, b })),
  desc: vi.fn((a: unknown) => ({ _op: 'desc', a })),
  asc: vi.fn((a: unknown) => ({ _op: 'asc', a })),
}));

// Records every .limit(n) call so tests can assert the exact limit argument used.
const limitCalls = vi.hoisted(() => ({ args: [] as unknown[] }));

// Control flag for the error-path test: when true, the fake tx's first query
// step (.limit) throws, simulating a transient DB error (timeout, connection blip).
const ctl = vi.hoisted(() => ({ throwOnQuery: false }));

// Per-table canned rows. Each test sets these; the fake tx returns rows by table.
const rows = vi.hoisted(() => ({
  dispatchTargets: [] as unknown[],
  dispatchJobs: [] as unknown[],
  dispatchRules: [] as unknown[],
  templates: [] as unknown[],
  campaigns: [] as unknown[],
  products: [] as unknown[],
}));

function makeFakeTx() {
  let table = '';
  const b: Record<string, (...a: unknown[]) => unknown> = {};
  b.select = () => b;
  b.from = (t: unknown) => {
    table = String((t as { _marker?: string })?._marker ?? '');
    return b;
  };
  b.where = () => b;
  b.orderBy = () => b;
  b.limit = (n: unknown) => {
    if (ctl.throwOnQuery) throw new Error('db blip');
    limitCalls.args.push(n);
    return (rows as Record<string, unknown[]>)[table] ?? [];
  };
  return b;
}

vi.mock('@leedi/db', () => {
  const tag = (m: string) => ({ _marker: m });
  return {
    withTenant: async (_id: string, fn: (tx: unknown) => Promise<unknown>) => fn(makeFakeTx()),
    schema: {
      dispatchTargets: {
        ...tag('dispatchTargets'),
        tenantId: 'dispatchTargets.tenant_id',
        leadId: 'dispatchTargets.lead_id',
        status: 'dispatchTargets.status',
        enviadoEm: 'dispatchTargets.enviado_em',
        dispatchJobId: 'dispatchTargets.dispatch_job_id',
        dispatchRuleId: 'dispatchTargets.dispatch_rule_id',
      },
      dispatchJobs: { ...tag('dispatchJobs'), id: 'dispatchJobs.id', templateId: 'dispatchJobs.template_id', campaignId: 'dispatchJobs.campaign_id' },
      dispatchRules: { ...tag('dispatchRules'), id: 'dispatchRules.id', templateId: 'dispatchRules.template_id' },
      templates: { ...tag('templates'), id: 'templates.id', nome: 'templates.nome', componentes: 'templates.componentes' },
      campaigns: { ...tag('campaigns'), id: 'campaigns.id', nome: 'campaigns.nome', produtoId: 'campaigns.produto_id' },
      products: { ...tag('products'), id: 'products.id', nome: 'products.nome' },
    },
    eq: ops.eq,
    and: ops.and,
    inArray: ops.inArray,
    gte: ops.gte,
    desc: ops.desc,
    asc: ops.asc,
  };
});

const TENANT = '11111111-1111-4111-8111-111111111111';
const LEAD = '22222222-2222-4222-8222-222222222222';

function resetRows() {
  rows.dispatchTargets = [];
  rows.dispatchJobs = [];
  rows.dispatchRules = [];
  rows.templates = [];
  rows.campaigns = [];
  rows.products = [];
}

describe('getDispatchOrigin', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetRows();
    limitCalls.args = [];
    ctl.throwOnQuery = false;
  });

  it('returns null when the lead has no qualifying dispatch target', async () => {
    const { getDispatchOrigin } = await import('../get-dispatch-origin.js');
    const result = await getDispatchOrigin(TENANT, LEAD);
    expect(result).toBeNull();
  });

  it('filters targets to delivered statuses (enviado/entregue/respondido)', async () => {
    rows.dispatchTargets = [{ dispatchJobId: null, dispatchRuleId: null }];
    const { getDispatchOrigin } = await import('../get-dispatch-origin.js');
    await getDispatchOrigin(TENANT, LEAD);
    expect(ops.inArray).toHaveBeenCalledWith(
      'dispatchTargets.status',
      ['enviado', 'entregue', 'respondido'],
    );
  });

  it('bounds the lookup to the last 48h relative to the injected now', async () => {
    rows.dispatchTargets = [{ dispatchJobId: null, dispatchRuleId: null }];
    const now = new Date('2026-06-21T12:00:00.000Z');
    const expectedCutoff = new Date('2026-06-19T12:00:00.000Z'); // now - 48h
    const { getDispatchOrigin } = await import('../get-dispatch-origin.js');
    await getDispatchOrigin(TENANT, LEAD, now);
    const gteCall = ops.gte.mock.calls.find((c) => c[0] === 'dispatchTargets.enviado_em');
    expect(gteCall).toBeDefined();
    expect((gteCall![1] as Date).toISOString()).toBe(expectedCutoff.toISOString());
  });

  it('orders by enviadoEm DESC and takes the most recent (limit 1)', async () => {
    rows.dispatchTargets = [{ dispatchJobId: null, dispatchRuleId: null }];
    const { getDispatchOrigin } = await import('../get-dispatch-origin.js');
    await getDispatchOrigin(TENANT, LEAD);
    expect(ops.desc).toHaveBeenCalledWith('dispatchTargets.enviado_em');
    expect(limitCalls.args[0]).toBe(1);
  });

  it('scopes by tenant and lead', async () => {
    rows.dispatchTargets = [{ dispatchJobId: null, dispatchRuleId: null }];
    const { getDispatchOrigin } = await import('../get-dispatch-origin.js');
    await getDispatchOrigin(TENANT, LEAD);
    expect(ops.eq).toHaveBeenCalledWith('dispatchTargets.lead_id', LEAD);
    expect(ops.eq).toHaveBeenCalledWith('dispatchTargets.tenant_id', TENANT);
  });

  it('resolves campaign + product via the job path', async () => {
    rows.dispatchTargets = [{ dispatchJobId: 'job-1', dispatchRuleId: null }];
    rows.dispatchJobs = [{ templateId: 'tpl-1', campaignId: 'camp-1' }];
    rows.templates = [{ nome: 'Abertura Carrinho', componentes: { body: { text: 'Vagas abertas! {{1}}' } } }];
    rows.campaigns = [{ nome: 'Lançamento Junho', produtoId: 'prod-1' }];
    rows.products = [{ nome: 'Curso Alpha' }];
    const { getDispatchOrigin } = await import('../get-dispatch-origin.js');
    const result = await getDispatchOrigin(TENANT, LEAD);
    expect(result).toEqual({
      templateNome: 'Abertura Carrinho',
      templateBody: 'Vagas abertas! {{1}}',
      campaignNome: 'Lançamento Junho',
      produtoNome: 'Curso Alpha',
    });
  });

  it('resolves template-only context via the recovery (rule) path', async () => {
    rows.dispatchTargets = [{ dispatchJobId: null, dispatchRuleId: 'rule-1' }];
    rows.dispatchRules = [{ templateId: 'tpl-2' }];
    rows.templates = [{ nome: 'Carrinho Abandonado', componentes: { body: { text: 'Esqueceu algo?' } } }];
    const { getDispatchOrigin } = await import('../get-dispatch-origin.js');
    const result = await getDispatchOrigin(TENANT, LEAD);
    expect(result).toEqual({
      templateNome: 'Carrinho Abandonado',
      templateBody: 'Esqueceu algo?',
      campaignNome: null,
      produtoNome: null,
    });
  });

  it('returns null when the resolved template no longer exists', async () => {
    rows.dispatchTargets = [{ dispatchJobId: 'job-1', dispatchRuleId: null }];
    rows.dispatchJobs = [{ templateId: 'tpl-x', campaignId: null }];
    rows.templates = []; // template deleted
    const { getDispatchOrigin } = await import('../get-dispatch-origin.js');
    const result = await getDispatchOrigin(TENANT, LEAD);
    expect(result).toBeNull();
  });

  it('returns null (not a rejection) when the DB lookup throws, and logs a warning', async () => {
    ctl.throwOnQuery = true;
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { getDispatchOrigin } = await import('../get-dispatch-origin.js');
    await expect(getDispatchOrigin(TENANT, LEAD)).resolves.toBeNull();
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});
