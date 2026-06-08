import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CampaignAlreadyEndedError } from '../end-campaign.js';

const TENANT_ID = '11111111-1111-4111-8111-111111111111';
const CAMPAIGN_ID = '22222222-2222-4222-8222-222222222222';

let campaignStatus: string = 'ativa';

vi.mock('@leedi/db', () => {
  return {
    withTenant: vi.fn((_id: string, fn: (tx: unknown) => unknown) =>
      fn({
        select: () => ({
          from() {
            return {
              where() {
                return {
                  limit: () =>
                    Promise.resolve(
                      campaignStatus !== 'missing' ? [{ status: campaignStatus }] : []
                    ),
                };
              },
            };
          },
        }),
        update: () => ({
          set(v: { status: string; fase: string }) {
            return {
              where() {
                return {
                  returning: () =>
                    Promise.resolve([
                      { id: CAMPAIGN_ID, tenantId: TENANT_ID, status: v.status, fase: v.fase },
                    ]),
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

beforeEach(() => { campaignStatus = 'ativa'; });

describe('endCampaign', () => {
  it('sets status=encerrada and fase=encerrada', async () => {
    const { endCampaign } = await import('../end-campaign.js');
    const result = await endCampaign(TENANT_ID, CAMPAIGN_ID);
    expect(result?.status).toBe('encerrada');
    expect(result?.fase).toBe('encerrada');
  });

  it('throws CampaignAlreadyEndedError if already encerrada', async () => {
    campaignStatus = 'encerrada';
    const { endCampaign } = await import('../end-campaign.js');
    await expect(endCampaign(TENANT_ID, CAMPAIGN_ID)).rejects.toBeInstanceOf(
      CampaignAlreadyEndedError
    );
  });

  it('returns null when campaign not found', async () => {
    campaignStatus = 'missing';
    const { endCampaign } = await import('../end-campaign.js');
    const result = await endCampaign(TENANT_ID, CAMPAIGN_ID);
    expect(result).toBeNull();
  });
});
