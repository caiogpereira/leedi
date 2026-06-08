import { describe, it, expect, vi, beforeEach } from 'vitest';

const TENANT_ID = '11111111-1111-4111-8111-111111111111';
const JOB_ID = 'job-1';

// Per-call leaf result queue for chained selects.
let selectResults: unknown[][] = [];
let insertedTargets: unknown[][] = [];
const updateSet = vi.fn();
const publishJSON = vi.fn(async () => ({ messageId: 'm1' }));
let segmentLeadIds: string[] = [];

vi.mock('@upstash/qstash', () => ({
  Client: class {
    publishJSON = publishJSON;
  },
}));

vi.mock('@leedi/config', () => ({
  env: { QSTASH_TOKEN: 'tok', BETTER_AUTH_URL: 'http://localhost:3000', API_PORT: '3003' },
}));

vi.mock('../../use-cases/segments/evaluate-segment.js', () => ({
  resolveSegmentLeadIds: vi.fn(async () => segmentLeadIds),
}));

function makeSelectChain() {
  const chain: Record<string, unknown> = {};
  const leaf = () => Promise.resolve(selectResults.shift() ?? []);
  chain.from = () => chain;
  chain.where = () => Promise.resolve(selectResults.shift() ?? []);
  // .limit terminates some chains; provide both forms.
  chain.limit = leaf;
  return new Proxy(chain, {
    get(target, prop) {
      if (prop in target) return target[prop as string];
      if (prop === 'then') return undefined;
      return () => chain;
    },
  });
}

vi.mock('@leedi/db', () => ({
  withTenant: vi.fn((_id: string, fn: (tx: unknown) => unknown) =>
    fn({
      select: () => {
        const chain: Record<string, unknown> = {};
        chain.from = () => chain;
        chain.where = () => {
          // Either resolves directly (list query) or continues to .limit().
          return {
            limit: () => Promise.resolve(selectResults.shift() ?? []),
            then: (resolve: (v: unknown) => void) =>
              resolve(selectResults.shift() ?? []),
          };
        };
        return chain;
      },
      insert: () => ({
        values: (rows: unknown[]) => {
          insertedTargets.push(rows);
          return Promise.resolve([]);
        },
      }),
      update: () => ({
        set: (v: unknown) => {
          updateSet(v);
          return { where: () => Promise.resolve([]) };
        },
      }),
    })
  ),
  schema: {
    dispatchJobs: { id: {}, status: {}, segmentId: {}, campaignId: {}, configThrottle: {}, tenantId: {}, totalAlvos: {} },
    whatsappConnections: { tenantId: {}, qualityRating: {} },
    segments: { id: {}, filtros: {} },
    campaigns: { id: {}, produtoId: {} },
    leads: { id: {}, status: {}, produtoCompradoId: {}, tenantId: {} },
    conversationWindows: { leadId: {}, tenantId: {}, endedAt: {}, startedAt: {} },
    dispatchTargets: {},
  },
  eq: vi.fn(() => ({})),
  and: vi.fn((...a: unknown[]) => a),
  inArray: vi.fn(() => ({})),
  sql: Object.assign(
    (strings: TemplateStringsArray, ...v: unknown[]) => ({ raw: strings.join('?'), v }),
    {}
  ),
}));

beforeEach(() => {
  selectResults = [];
  insertedTargets = [];
  segmentLeadIds = [];
  updateSet.mockClear();
  publishJSON.mockClear();
});

describe('runDispatchJob', () => {
  it('skips when status is not agendado', async () => {
    selectResults = [
      [{ id: JOB_ID, status: 'concluido', segmentId: 's1', campaignId: null, configThrottle: {} }], // job
      [{ qualityRating: 'verde' }], // connection
    ];
    const { runDispatchJob } = await import('../run-dispatch-job.js');
    const result = await runDispatchJob({ dispatchJobId: JOB_ID, tenantId: TENANT_ID });
    expect(result.skipped).toBe(true);
    expect(result.reason).toBe('not_agendado');
  });

  it('pauses the job when quality is vermelho', async () => {
    selectResults = [
      [{ id: JOB_ID, status: 'agendado', segmentId: 's1', campaignId: null, configThrottle: {} }],
      [{ qualityRating: 'vermelho' }],
      [{ filtros: {} }], // segment
    ];
    const { runDispatchJob } = await import('../run-dispatch-job.js');
    const result = await runDispatchJob({ dispatchJobId: JOB_ID, tenantId: TENANT_ID });
    expect(result.reason).toBe('quality_red');
    expect(updateSet).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'pausado' })
    );
  });

  it('excludes optout and ja_comprou leads', async () => {
    segmentLeadIds = ['lead-optout', 'lead-bought', 'lead-ok'];
    selectResults = [
      [{ id: JOB_ID, status: 'agendado', segmentId: 's1', campaignId: 'camp-1', configThrottle: { tier_interval_ms: 1000 } }], // job
      [{ qualityRating: 'verde' }], // connection
      [{ filtros: {} }], // segment
      [{ produtoId: 'prod-1' }], // campaign produto
      // leads
      [
        { id: 'lead-optout', status: 'optout', produtoCompradoId: null },
        { id: 'lead-bought', status: 'ativo', produtoCompradoId: 'prod-1' },
        { id: 'lead-ok', status: 'ativo', produtoCompradoId: null },
      ],
      [], // active windows
    ];
    const { runDispatchJob } = await import('../run-dispatch-job.js');
    const result = await runDispatchJob({ dispatchJobId: JOB_ID, tenantId: TENANT_ID });
    expect(result.totalAlvos).toBe(1); // only lead-ok is pendente

    const inserted = insertedTargets.flat() as Array<{ leadId: string; status: string; motivoExclusao: string | null }>;
    const optout = inserted.find((t) => t.leadId === 'lead-optout');
    const bought = inserted.find((t) => t.leadId === 'lead-bought');
    const ok = inserted.find((t) => t.leadId === 'lead-ok');
    expect(optout?.status).toBe('excluido');
    expect(optout?.motivoExclusao).toBe('optout');
    expect(bought?.motivoExclusao).toBe('ja_comprou');
    expect(ok?.status).toBe('pendente');
  });
});
