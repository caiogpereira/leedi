import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DispatchValidationError } from '../create-dispatch-job.js';

const TENANT_ID = '11111111-1111-4111-8111-111111111111';
const TEMPLATE_ID = '22222222-2222-4222-8222-222222222222';
const SEGMENT_ID = '33333333-3333-4333-8333-333333333333';

// Queues of rows returned by sequential .limit()/.returning() leaf calls.
let selectResults: unknown[][] = [];
let insertResult: unknown[] = [];
const publishJSON = vi.fn(async (_opts: { url: string; delay: number; body: unknown }) => ({
  messageId: 'qstash-msg-1',
}));

vi.mock('@upstash/qstash', () => ({
  Client: class {
    publishJSON = publishJSON;
  },
}));

vi.mock('@leedi/config', () => ({
  env: { QSTASH_TOKEN: 'tok', BETTER_AUTH_URL: 'http://localhost:3000', API_PORT: '3003' },
}));

function makeSelectChain() {
  const chain: Record<string, unknown> = {};
  const leaf = () => Promise.resolve(selectResults.shift() ?? []);
  chain.from = () => chain;
  chain.where = () => chain;
  chain.limit = leaf;
  chain.orderBy = () => chain;
  chain.offset = leaf;
  return chain;
}

vi.mock('@leedi/db', () => ({
  withTenant: vi.fn((_id: string, fn: (tx: unknown) => unknown) =>
    fn({
      select: () => makeSelectChain(),
      insert: () => ({
        values: () => ({ returning: () => Promise.resolve(insertResult) }),
      }),
      update: () => ({ set: () => ({ where: () => Promise.resolve([]) }) }),
    })
  ),
  schema: {
    templates: { id: {}, status: {}, tenantId: {} },
    segments: { id: {}, tenantId: {} },
    whatsappConnections: { tenantId: {}, qualityRating: {}, messagingTier: {} },
    dispatchJobs: { id: {}, status: {}, tenantId: {} },
  },
  eq: vi.fn(() => ({})),
  and: vi.fn((...a: unknown[]) => a),
}));

beforeEach(() => {
  selectResults = [];
  insertResult = [];
  publishJSON.mockClear();
});

const FUTURE = new Date(Date.now() + 3600_000).toISOString();

describe('createDispatchJob', () => {
  it('rejects when the template is not aprovado', async () => {
    selectResults = [
      [{ id: TEMPLATE_ID, status: 'pendente' }], // template
      [{ id: SEGMENT_ID }], // segment
      [{ qualityRating: 'verde', messagingTier: '10k' }], // connection
    ];
    const { createDispatchJob } = await import('../create-dispatch-job.js');
    await expect(
      createDispatchJob(TENANT_ID, { templateId: TEMPLATE_ID, segmentId: SEGMENT_ID, agendadoPara: FUTURE })
    ).rejects.toBeInstanceOf(DispatchValidationError);
  });

  it('rejects when quality is vermelho', async () => {
    selectResults = [
      [{ id: TEMPLATE_ID, status: 'aprovado' }],
      [{ id: SEGMENT_ID }],
      [{ qualityRating: 'vermelho', messagingTier: '10k' }],
    ];
    const { createDispatchJob } = await import('../create-dispatch-job.js');
    await expect(
      createDispatchJob(TENANT_ID, { templateId: TEMPLATE_ID, segmentId: SEGMENT_ID, agendadoPara: FUTURE })
    ).rejects.toThrow(/qualidade RED/);
  });

  it('rejects a schedule time in the past', async () => {
    const { createDispatchJob } = await import('../create-dispatch-job.js');
    await expect(
      createDispatchJob(TENANT_ID, {
        templateId: TEMPLATE_ID,
        segmentId: SEGMENT_ID,
        agendadoPara: new Date(Date.now() - 1000).toISOString(),
      })
    ).rejects.toThrow(/futuro/);
  });

  it('creates a job and schedules a QStash run-job', async () => {
    selectResults = [
      [{ id: TEMPLATE_ID, status: 'aprovado' }],
      [{ id: SEGMENT_ID }],
      [{ qualityRating: 'verde', messagingTier: '1k' }],
    ];
    insertResult = [{ id: 'job-1', status: 'agendado' }];
    const { createDispatchJob } = await import('../create-dispatch-job.js');
    const result = await createDispatchJob(TENANT_ID, {
      templateId: TEMPLATE_ID,
      segmentId: SEGMENT_ID,
      agendadoPara: FUTURE,
    });
    expect(result.id).toBe('job-1');
    expect(result.status).toBe('agendado');
    expect(publishJSON).toHaveBeenCalledTimes(1);
    const arg = publishJSON.mock.calls[0]![0];
    expect(arg.url).toContain('/api/internal/dispatch/run-job');
  });
});
