import { describe, it, expect, vi, beforeEach } from 'vitest';

const TENANT_ID = '11111111-1111-4111-8111-111111111111';
const JOB_ID = 'job-1';

let selectResults: unknown[][] = [];
const updateSet = vi.fn();
const publishJSON = vi.fn(async () => ({ messageId: 'm1' }));
const sendTemplate = vi.fn(async () => ({ messageId: 'wamid-1' }));

vi.mock('@upstash/qstash', () => ({
  Client: class {
    publishJSON = publishJSON;
  },
}));

vi.mock('@leedi/config', () => ({
  env: { QSTASH_TOKEN: 'tok', BETTER_AUTH_URL: 'http://localhost:3000', API_PORT: '3003' },
}));

vi.mock('@leedi/connection', () => ({
  MetaCloudProvider: class {
    sendTemplate = sendTemplate;
  },
}));

vi.mock('@leedi/observability', () => ({ captureException: vi.fn() }));

vi.mock('@leedi/notification', () => ({
  sendNotificationToTenantRole: vi.fn(() => Promise.resolve()),
}));

function leaf() {
  return Promise.resolve(selectResults.shift() ?? []);
}

vi.mock('@leedi/db', () => ({
  withTenant: vi.fn((_id: string, fn: (tx: unknown) => unknown) =>
    fn({
      select: () => {
        const chain: Record<string, unknown> = {};
        chain.from = () => chain;
        chain.where = () => ({
          limit: leaf,
          orderBy: () => ({ limit: leaf }),
          then: (resolve: (v: unknown) => void) => resolve(selectResults.shift() ?? []),
        });
        return chain;
      },
      update: () => ({
        set: (v: unknown) => {
          updateSet(v);
          return { where: () => Promise.resolve([]) };
        },
      }),
    })
  ),
  schema: {
    dispatchJobs: { id: {}, status: {}, templateId: {}, configThrottle: {}, tenantId: {}, enviados: {}, falhas: {} },
    templates: { id: {}, nome: {} },
    whatsappConnections: { tenantId: {} },
    dispatchTargets: { id: {}, leadId: {}, dispatchJobId: {}, status: {}, createdAt: {} },
    leads: { id: {}, telefone: {}, tenantId: {} },
  },
  eq: vi.fn(() => ({})),
  and: vi.fn((...a: unknown[]) => a),
  inArray: vi.fn(() => ({})),
  sql: Object.assign((s: TemplateStringsArray, ...v: unknown[]) => ({ raw: s.join('?'), v }), {}),
}));

beforeEach(() => {
  selectResults = [];
  updateSet.mockClear();
  publishJSON.mockClear();
  sendTemplate.mockClear();
});

describe('processDispatchBatch', () => {
  it('aborts when the job is pausado', async () => {
    selectResults = [
      [{ id: JOB_ID, status: 'pausado', templateId: 't1', configThrottle: {} }], // job
      [{ nome: 'tpl' }], // template
      [{ phoneNumberId: 'p', wabaId: 'w', accessTokenEncrypted: 'e', accessTokenIv: 'iv' }], // connection
    ];
    const { processDispatchBatch } = await import('../process-dispatch-batch.js');
    const result = await processDispatchBatch({ dispatchJobId: JOB_ID, tenantId: TENANT_ID });
    expect(result.done).toBe(true);
    expect(sendTemplate).not.toHaveBeenCalled();
  });

  it('marks the job concluido when there are no pending targets', async () => {
    selectResults = [
      [{ id: JOB_ID, status: 'processando', templateId: 't1', configThrottle: {} }],
      [{ nome: 'tpl' }],
      [{ phoneNumberId: 'p', wabaId: 'w', accessTokenEncrypted: 'e', accessTokenIv: 'iv' }],
      [], // no pending targets
    ];
    const { processDispatchBatch } = await import('../process-dispatch-batch.js');
    const result = await processDispatchBatch({ dispatchJobId: JOB_ID, tenantId: TENANT_ID });
    expect(result.done).toBe(true);
    expect(updateSet).toHaveBeenCalledWith(expect.objectContaining({ status: 'concluido' }));
  });

  it('sends a template and records the wamid, then chains the next batch', async () => {
    selectResults = [
      [{ id: JOB_ID, status: 'processando', templateId: 't1', configThrottle: { tier_interval_ms: 500 } }],
      [{ nome: 'promo_template' }],
      [{ phoneNumberId: 'p', wabaId: 'w', accessTokenEncrypted: 'e', accessTokenIv: 'iv' }],
      [{ id: 'target-1', leadId: 'lead-1' }], // one pending target
      [{ id: 'lead-1', telefone: '+5511999999999' }], // lead phones
    ];
    const { processDispatchBatch } = await import('../process-dispatch-batch.js');
    const result = await processDispatchBatch({ dispatchJobId: JOB_ID, tenantId: TENANT_ID });
    expect(sendTemplate).toHaveBeenCalledWith('+5511999999999', 'promo_template', []);
    expect(result.sent).toBe(1);
    expect(updateSet).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'enviado', wamid: 'wamid-1' })
    );
    expect(publishJSON).toHaveBeenCalledTimes(1); // next batch chained
  });
});
