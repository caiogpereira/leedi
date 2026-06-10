import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

/**
 * Mock @leedi/db. getLeadDetail issues up to three queries inside one withTenant call:
 *   lead:   tx.select().from(leads).where().limit()             -> [leadRow] | []
 *   tags:   tx.select().from(lead_tags).where().orderBy()       -> tagRows
 *   events: tx.select().from(lead_journey_events).where().orderBy() -> eventRows
 *
 * We distinguish them by the table identifier passed to .from(), so each query
 * resolves to its own result set regardless of which builder methods are chained.
 */
const orderByCalls: unknown[] = [];
let leadRows: unknown[] = [];
let tagRows: unknown[] = [];
let eventRows: unknown[] = [];
let windowCountRows: unknown[] = [];

vi.mock('@leedi/db', () => {
  const leadsTable = {
    id: 'leads.id',
    tenantId: 'leads.tenant_id',
    telefone: 'leads.telefone',
    nome: 'leads.nome',
    email: 'leads.email',
    origem: 'leads.origem',
    temperatura: 'leads.temperatura',
    status: 'leads.status',
    comprou: 'leads.comprou',
    produtoCompradoId: 'leads.produto_comprado_id',
    dataCompra: 'leads.data_compra',
    primeiraInteracao: 'leads.primeira_interacao',
    ultimaInteracao: 'leads.ultima_interacao',
    qualificacao: 'leads.qualificacao',
    leadRecorrente: 'leads.lead_recorrente',
    createdAt: 'leads.created_at',
    updatedAt: 'leads.updated_at',
  };
  const leadTagsTable = {
    id: 'lead_tags.id',
    leadId: 'lead_tags.lead_id',
    tag: 'lead_tags.tag',
    origemTag: 'lead_tags.origem_tag',
    createdAt: 'lead_tags.created_at',
  };
  const leadJourneyEventsTable = {
    id: 'lead_journey_events.id',
    leadId: 'lead_journey_events.lead_id',
    tipo: 'lead_journey_events.tipo',
    detalhes: 'lead_journey_events.detalhes',
    createdAt: 'lead_journey_events.created_at',
  };
  const conversationWindowsTable = {
    id: 'conversation_windows.id',
    leadId: 'conversation_windows.lead_id',
  };
  return {
    withTenant: vi.fn(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (_tenantId: string, fn: (tx: any) => Promise<unknown>) =>
        fn({
          select: () => {
            let table: unknown;
            const chain: Record<string, unknown> = {};
            chain.from = (t: unknown) => {
              table = t;
              return chain;
            };
            chain.where = () => chain;
            chain.orderBy = (arg: unknown) => {
              orderByCalls.push(arg);
              return chain;
            };
            chain.limit = () => chain;
            chain.then = (resolve: (v: unknown) => unknown) => {
              let rows: unknown[] = [];
              if (table === leadsTable) rows = leadRows;
              else if (table === leadTagsTable) rows = tagRows;
              else if (table === leadJourneyEventsTable) rows = eventRows;
              else if (table === conversationWindowsTable) rows = windowCountRows;
              return Promise.resolve(rows).then(resolve);
            };
            return chain;
          },
        })
    ),
    schema: {
      leads: leadsTable,
      leadTags: leadTagsTable,
      leadJourneyEvents: leadJourneyEventsTable,
      conversationWindows: conversationWindowsTable,
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

describe('getLeadDetail', () => {
  beforeEach(() => {
    orderByCalls.length = 0;
    leadRows = [];
    tagRows = [];
    eventRows = [];
    windowCountRows = [];
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns null when the lead is not found for the tenant', async () => {
    const { getLeadDetail } = await import('../get-lead-detail.js');

    leadRows = []; // no matching lead

    const result = await getLeadDetail({ tenantId: 'tenant-1', leadId: VALID_UUID });
    expect(result).toBeNull();
  });

  it('returns null for a malformed (non-UUID) leadId without querying', async () => {
    const { getLeadDetail } = await import('../get-lead-detail.js');
    const { withTenant } = await import('@leedi/db');

    const result = await getLeadDetail({ tenantId: 'tenant-1', leadId: 'not-a-uuid' });
    expect(result).toBeNull();
    expect(withTenant).not.toHaveBeenCalled();
  });

  it('returns the lead with tags and journey events ordered DESC by createdAt', async () => {
    const { getLeadDetail } = await import('../get-lead-detail.js');

    const newer = new Date('2026-05-02T10:00:00Z');
    const older = new Date('2026-05-01T10:00:00Z');

    leadRows = [
      {
        id: VALID_UUID,
        tenantId: 'tenant-1',
        telefone: '+5511999999999',
        nome: 'Ana',
        email: null,
        origem: 'instagram',
        temperatura: 'quente',
        status: 'ativo',
        comprou: false,
        produtoCompradoId: null,
        dataCompra: null,
        primeiraInteracao: older,
        ultimaInteracao: newer,
        qualificacao: { interesse: 'alto' },
        leadRecorrente: false,
        createdAt: older,
        updatedAt: newer,
      },
    ];
    tagRows = [
      { id: 'tag-1', tag: 'vip', origemTag: 'manual', createdAt: older },
      { id: 'tag-2', tag: 'quente', origemTag: 'agente', createdAt: newer },
    ];
    // The use case orders DESC at the DB layer; the mock returns rows as given,
    // so we provide them already in the expected DESC order.
    eventRows = [
      { id: 'ev-2', tipo: 'respondeu', detalhes: {}, createdAt: newer },
      { id: 'ev-1', tipo: 'captado', detalhes: { canal: 'wpp' }, createdAt: older },
    ];

    const result = await getLeadDetail({ tenantId: 'tenant-1', leadId: VALID_UUID });

    expect(result).not.toBeNull();
    expect(result!.id).toBe(VALID_UUID);
    expect(result!.nome).toBe('Ana');
    expect(result!.qualificacao).toEqual({ interesse: 'alto' });
    expect(result!.tags).toHaveLength(2);
    expect(result!.tags[0]!.tag).toBe('vip');
    expect(result!.journeyEvents).toHaveLength(2);
    expect(result!.journeyEvents[0]!.id).toBe('ev-2');
    expect(result!.journeyEvents[1]!.id).toBe('ev-1');
    expect(result!.journeyEvents[1]!.detalhes).toEqual({ canal: 'wpp' });

    // events ordered DESC via sql template
    const eventOrder = orderByCalls.find(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (o: any) => o?.op === 'sql' && o.values?.[0] === 'lead_journey_events.created_at'
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((eventOrder as any).strings.join('')).toContain('DESC');
  });

  const baseLead = {
    id: VALID_UUID,
    tenantId: 'tenant-1',
    telefone: '+5511999999999',
    nome: null,
    email: null,
    origem: null,
    temperatura: 'frio',
    status: 'ativo',
    comprou: false,
    produtoCompradoId: null,
    dataCompra: null,
    primeiraInteracao: null,
    ultimaInteracao: null,
    qualificacao: {},
    leadRecorrente: false,
    createdAt: new Date('2026-05-01T10:00:00Z'),
    updatedAt: new Date('2026-05-01T10:00:00Z'),
  };

  it('reports the real conversation_windows count for the lead', async () => {
    const { getLeadDetail } = await import('../get-lead-detail.js');

    leadRows = [baseLead];
    windowCountRows = [{ count: 3 }];

    const result = await getLeadDetail({ tenantId: 'tenant-1', leadId: VALID_UUID });
    expect(result!.conversationCount).toBe(3);
  });

  it('defaults conversationCount to 0 when the lead has no windows', async () => {
    const { getLeadDetail } = await import('../get-lead-detail.js');

    leadRows = [baseLead];
    windowCountRows = []; // count query returned no row

    const result = await getLeadDetail({ tenantId: 'tenant-1', leadId: VALID_UUID });
    expect(result!.conversationCount).toBe(0);
  });
});
