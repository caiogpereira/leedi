import { describe, it, expect, vi, beforeEach } from 'vitest';

const TENANT_ID = '11111111-1111-4111-8111-111111111111';
const CAMPAIGN_ID = '22222222-2222-4222-8222-222222222222';

// Use vi.hoisted so these are available when vi.mock is hoisted
const { mockPublishJSON, mockMessagesDelete, MockClient } = vi.hoisted(() => {
  const mockPublishJSON = vi.fn().mockResolvedValue({ messageId: 'job-123' });
  const mockMessagesDelete = vi.fn().mockResolvedValue(undefined);
  function MockClient() {
    return { publishJSON: mockPublishJSON, messages: { delete: mockMessagesDelete } };
  }
  return { mockPublishJSON, mockMessagesDelete, MockClient };
});

vi.mock('@upstash/qstash', () => ({
  Client: MockClient,
}));

vi.mock('@leedi/config', () => ({
  env: {
    QSTASH_TOKEN: 'test-token',
    BETTER_AUTH_URL: 'http://localhost:3000',
    API_PORT: 3003,
  },
}));

let mockCampaignStatus: string = 'ativa';
const transitionPhaseCalls: string[] = [];

vi.mock('@leedi/db', () => ({
  withTenant: vi.fn((_id: string, fn: (tx: unknown) => unknown) =>
    fn({
      select: () => ({
        from() {
          return {
            where() {
              return {
                limit: () =>
                  Promise.resolve(
                    mockCampaignStatus !== 'missing' ? [{ status: mockCampaignStatus }] : []
                  ),
              };
            },
          };
        },
      }),
    })
  ),
  schema: { campaigns: { __name: 'campaigns' } },
  eq: vi.fn((_a: unknown, _b: unknown) => ({})),
  and: vi.fn((...args: unknown[]) => args),
}));

vi.mock('../../use-cases/campaigns/transition-campaign-phase.js', () => ({
  transitionCampaignPhase: vi.fn((_tenantId: string, _id: string, phase: string) => {
    transitionPhaseCalls.push(phase);
    return Promise.resolve({ id: CAMPAIGN_ID, fase: phase });
  }),
}));

vi.mock('@leedi/observability', () => ({
  captureException: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
  mockCampaignStatus = 'ativa';
  transitionPhaseCalls.length = 0;
  mockPublishJSON.mockResolvedValue({ messageId: 'job-123' });
  mockMessagesDelete.mockResolvedValue(undefined);
});

describe('schedulePhaseTransitionJob', () => {
  it('enqueues a QStash job and returns the messageId', async () => {
    const { schedulePhaseTransitionJob } = await import('../campaign-phase-transition.js');
    const futureDate = new Date(Date.now() + 60_000);
    const jobId = await schedulePhaseTransitionJob({
      tenantId: TENANT_ID,
      campaignId: CAMPAIGN_ID,
      targetPhase: 'downsell',
      transitionDate: futureDate,
    });
    expect(mockPublishJSON).toHaveBeenCalledOnce();
    expect(jobId).toBe('job-123');
    const call = mockPublishJSON.mock.calls[0][0] as { url: string; body: object; delay: number };
    expect(call.url).toContain('/api/internal/campaign-phase-transition');
    expect(call.delay).toBeGreaterThan(0);
  });

  it('returns null when transition date is in the past', async () => {
    const { schedulePhaseTransitionJob } = await import('../campaign-phase-transition.js');
    const pastDate = new Date(Date.now() - 60_000);
    const jobId = await schedulePhaseTransitionJob({
      tenantId: TENANT_ID,
      campaignId: CAMPAIGN_ID,
      targetPhase: 'downsell',
      transitionDate: pastDate,
    });
    expect(mockPublishJSON).not.toHaveBeenCalled();
    expect(jobId).toBeNull();
  });

  it('cancels the existing job before scheduling a new one', async () => {
    const { schedulePhaseTransitionJob } = await import('../campaign-phase-transition.js');
    await schedulePhaseTransitionJob({
      tenantId: TENANT_ID,
      campaignId: CAMPAIGN_ID,
      targetPhase: 'downsell',
      transitionDate: new Date(Date.now() + 60_000),
      existingJobId: 'old-job-id',
    });
    expect(mockMessagesDelete).toHaveBeenCalledWith('old-job-id');
    expect(mockPublishJSON).toHaveBeenCalledOnce();
  });
});

describe('syncPhaseTransitionJobs', () => {
  it('schedules a job when aquecimento has tipo=data transition', async () => {
    const { syncPhaseTransitionJobs } = await import('../campaign-phase-transition.js');
    const futureDate = new Date(Date.now() + 60_000).toISOString();
    const config = {
      aquecimento: { transicao: { tipo: 'data' as const, data: futureDate } },
    };
    const result = await syncPhaseTransitionJobs(TENANT_ID, CAMPAIGN_ID, config);
    expect(mockPublishJSON).toHaveBeenCalledOnce();
    expect(result.aquecimento?.transicao?.scheduledJobId).toBe('job-123');
  });

  it('cancels old job and schedules new one when date is changed', async () => {
    const { syncPhaseTransitionJobs } = await import('../campaign-phase-transition.js');
    const futureDate = new Date(Date.now() + 60_000).toISOString();
    const config = {
      aquecimento: {
        transicao: { tipo: 'data' as const, data: futureDate, scheduledJobId: 'old-job' },
      },
    };
    await syncPhaseTransitionJobs(TENANT_ID, CAMPAIGN_ID, config);
    expect(mockMessagesDelete).toHaveBeenCalledWith('old-job');
    expect(mockPublishJSON).toHaveBeenCalledOnce();
  });

  it('does not schedule when transicao.tipo is manual', async () => {
    const { syncPhaseTransitionJobs } = await import('../campaign-phase-transition.js');
    const config = {
      aquecimento: { transicao: { tipo: 'manual' as const } },
    };
    await syncPhaseTransitionJobs(TENANT_ID, CAMPAIGN_ID, config);
    expect(mockPublishJSON).not.toHaveBeenCalled();
  });
});

describe('processCampaignPhaseTransition', () => {
  it('calls transitionCampaignPhase when campaign is still active', async () => {
    mockCampaignStatus = 'ativa';
    const { processCampaignPhaseTransition } = await import('../campaign-phase-transition.js');
    const result = await processCampaignPhaseTransition({
      tenantId: TENANT_ID,
      campaignId: CAMPAIGN_ID,
      targetPhase: 'downsell',
    });
    expect(result.skipped).toBe(false);
    expect(transitionPhaseCalls).toContain('downsell');
  });

  it('skips gracefully when campaign is no longer active', async () => {
    mockCampaignStatus = 'pausada';
    const { processCampaignPhaseTransition } = await import('../campaign-phase-transition.js');
    const result = await processCampaignPhaseTransition({
      tenantId: TENANT_ID,
      campaignId: CAMPAIGN_ID,
      targetPhase: 'downsell',
    });
    expect(result.skipped).toBe(true);
    expect(transitionPhaseCalls).toHaveLength(0);
  });

  it('skips gracefully when campaign not found', async () => {
    mockCampaignStatus = 'missing';
    const { processCampaignPhaseTransition } = await import('../campaign-phase-transition.js');
    const result = await processCampaignPhaseTransition({
      tenantId: TENANT_ID,
      campaignId: CAMPAIGN_ID,
      targetPhase: 'downsell',
    });
    expect(result.skipped).toBe(true);
  });
});
