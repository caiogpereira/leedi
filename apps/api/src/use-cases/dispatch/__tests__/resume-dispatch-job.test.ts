import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DispatchValidationError } from '../create-dispatch-job.js';

const TENANT_ID = '11111111-1111-4111-8111-111111111111';
const JOB_ID = 'job-1';

// Leaf queue consumed in order: [job], [connection], [targetCount].
let selectResults: unknown[][] = [];
const updateSet = vi.fn();
const publishJSON = vi.fn(async (_opts: { url: string; delay: number; body: unknown }) => ({
  messageId: 'm1',
}));

vi.mock('@upstash/qstash', () => ({
  Client: class {
    publishJSON = publishJSON;
  },
}));

vi.mock('@leedi/config', () => ({
  env: { QSTASH_TOKEN: 'tok', BETTER_AUTH_URL: 'http://localhost:3000', API_PORT: '3003' },
}));

vi.mock('@leedi/db', () => ({
  withTenant: vi.fn((_id: string, fn: (tx: unknown) => unknown) =>
    fn({
      select: () => {
        const chain: Record<string, unknown> = {};
        chain.from = () => chain;
        // .limit() terminates the job/connection selects; awaiting .where()
        // directly terminates the count select.
        chain.where = () => ({
          limit: () => Promise.resolve(selectResults.shift() ?? []),
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
    dispatchJobs: { id: {}, status: {}, configThrottle: {}, tenantId: {} },
    whatsappConnections: { tenantId: {}, qualityRating: {} },
    dispatchTargets: { tenantId: {}, dispatchJobId: {} },
  },
  eq: vi.fn(() => ({})),
  and: vi.fn((...a: unknown[]) => a),
  sql: Object.assign((s: TemplateStringsArray, ...v: unknown[]) => ({ raw: s.join('?'), v }), {}),
}));

beforeEach(() => {
  selectResults = [];
  updateSet.mockClear();
  publishJSON.mockClear();
});

describe('resumeDispatchJob', () => {
  it('throws 404 when the job does not exist', async () => {
    selectResults = [[], [{ qualityRating: 'verde' }], [{ n: 0 }]];
    const { resumeDispatchJob } = await import('../resume-dispatch-job.js');
    await expect(resumeDispatchJob(TENANT_ID, JOB_ID)).rejects.toMatchObject({ status: 404 });
  });

  it('throws 409 when the job is not pausado', async () => {
    selectResults = [
      [{ id: JOB_ID, status: 'processando', configThrottle: {} }],
      [{ qualityRating: 'verde' }],
      [{ n: 0 }],
    ];
    const { resumeDispatchJob } = await import('../resume-dispatch-job.js');
    await expect(resumeDispatchJob(TENANT_ID, JOB_ID)).rejects.toMatchObject({ status: 409 });
  });

  it('throws 422 when quality is vermelho', async () => {
    selectResults = [
      [{ id: JOB_ID, status: 'pausado', configThrottle: { paused_reason: 'quality_red' } }],
      [{ qualityRating: 'vermelho' }],
      [{ n: 1 }],
    ];
    const { resumeDispatchJob } = await import('../resume-dispatch-job.js');
    const err = await resumeDispatchJob(TENANT_ID, JOB_ID).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(DispatchValidationError);
    expect(err).toMatchObject({ status: 422 });
    expect(updateSet).not.toHaveBeenCalled();
  });

  it('resumes a materialized job → processando, clears paused_reason, re-enqueues process-batch', async () => {
    selectResults = [
      [{ id: JOB_ID, status: 'pausado', configThrottle: { tier_interval_ms: 500, paused_reason: 'quality_red' } }],
      [{ qualityRating: 'verde' }],
      [{ n: 7 }], // already has targets
    ];
    const { resumeDispatchJob } = await import('../resume-dispatch-job.js');
    const result = await resumeDispatchJob(TENANT_ID, JOB_ID);
    expect(result.status).toBe('processando');
    expect(updateSet).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'processando', configThrottle: { tier_interval_ms: 500 } })
    );
    expect(publishJSON).toHaveBeenCalledTimes(1);
    expect(publishJSON.mock.calls[0]![0].url).toContain('/api/internal/dispatch/process-batch');
  });

  it('resumes a never-materialized job → agendado, re-enqueues run-job (not process-batch)', async () => {
    selectResults = [
      [{ id: JOB_ID, status: 'pausado', configThrottle: { paused_reason: 'quality_red' } }],
      [{ qualityRating: 'verde' }],
      [{ n: 0 }], // paused at startup, no targets materialized
    ];
    const { resumeDispatchJob } = await import('../resume-dispatch-job.js');
    const result = await resumeDispatchJob(TENANT_ID, JOB_ID);
    expect(result.status).toBe('agendado');
    expect(updateSet).toHaveBeenCalledWith(expect.objectContaining({ status: 'agendado' }));
    expect(publishJSON).toHaveBeenCalledTimes(1);
    expect(publishJSON.mock.calls[0]![0].url).toContain('/api/internal/dispatch/run-job');
  });
});
