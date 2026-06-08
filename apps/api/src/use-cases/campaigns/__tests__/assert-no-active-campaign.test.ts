import { describe, it, expect, vi, beforeEach } from 'vitest';

const TENANT_ID = '11111111-1111-4111-8111-111111111111';

let mockActiveCampaigns: unknown[] = [];

vi.mock('@leedi/db', () => {
  return {
    withTenant: vi.fn((_id: string, fn: (tx: unknown) => unknown) =>
      fn({
        select: () => ({
          from() {
            return {
              where() {
                return { limit: () => Promise.resolve(mockActiveCampaigns) };
              },
            };
          },
        }),
      })
    ),
    schema: { campaigns: { __name: 'campaigns' } },
    eq: vi.fn((_a: unknown, _b: unknown) => ({})),
    and: vi.fn((...args: unknown[]) => args),
  };
});

beforeEach(() => {
  mockActiveCampaigns = [];
});

describe('assertNoActiveCampaign', () => {
  it('throws ActiveCampaignConflictError (statusCode 409) when an active campaign exists', async () => {
    mockActiveCampaigns = [{ id: 'existing-campaign' }];
    const { assertNoActiveCampaign, ActiveCampaignConflictError } = await import(
      '../assert-no-active-campaign.js'
    );
    await expect(assertNoActiveCampaign(TENANT_ID)).rejects.toBeInstanceOf(
      ActiveCampaignConflictError
    );
  });

  it('resolves silently when no active campaign exists', async () => {
    mockActiveCampaigns = [];
    const { assertNoActiveCampaign } = await import('../assert-no-active-campaign.js');
    await expect(assertNoActiveCampaign(TENANT_ID)).resolves.toBeUndefined();
  });
});
