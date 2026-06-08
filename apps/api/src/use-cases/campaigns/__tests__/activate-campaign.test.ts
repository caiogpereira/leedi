import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ActiveCampaignConflictError } from '../assert-no-active-campaign.js';

const TENANT_ID = '11111111-1111-4111-8111-111111111111';
const CAMPAIGN_ID = '22222222-2222-4222-8222-222222222222';

let activeCampaigns: unknown[] = [];
let updateCalls: unknown[] = [];

vi.mock('@leedi/db', () => {
  return {
    withTenant: vi.fn((_id: string, fn: (tx: unknown) => unknown) =>
      fn({
        select: () => ({
          from() {
            return {
              where() {
                return { limit: () => Promise.resolve(activeCampaigns) };
              },
            };
          },
        }),
        update: () => ({
          set(v: unknown) {
            updateCalls.push(v);
            return {
              where() {
                return {
                  returning() {
                    return Promise.resolve([
                      { id: CAMPAIGN_ID, tenantId: TENANT_ID, status: 'ativa', fase: 'aquecimento' },
                    ]);
                  },
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
  };
});

beforeEach(() => {
  activeCampaigns = [];
  updateCalls = [];
});

describe('activateCampaign', () => {
  it('throws 409 when another ativa campaign exists', async () => {
    activeCampaigns = [{ id: 'other-campaign' }];
    const { activateCampaign } = await import('../activate-campaign.js');
    await expect(activateCampaign(TENANT_ID, CAMPAIGN_ID)).rejects.toBeInstanceOf(
      ActiveCampaignConflictError
    );
  });

  it('sets status to ativa when no conflict', async () => {
    activeCampaigns = [];
    const { activateCampaign } = await import('../activate-campaign.js');
    const result = await activateCampaign(TENANT_ID, CAMPAIGN_ID);
    expect(result.status).toBe('ativa');
  });
});
