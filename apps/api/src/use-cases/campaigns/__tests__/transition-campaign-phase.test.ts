import { describe, it, expect, vi, beforeEach } from 'vitest';

const TENANT_ID = '11111111-1111-4111-8111-111111111111';
const CAMPAIGN_ID = '22222222-2222-4222-8222-222222222222';

let campaignState: { fase: string; tipo: string; config: object } = {
  fase: 'aquecimento',
  tipo: 'lancamento',
  config: {},
};

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
                    Promise.resolve([campaignState]),
                };
              },
            };
          },
        }),
        update: () => ({
          set(v: { fase: string }) {
            campaignState = { ...campaignState, fase: v.fase };
            return {
              where() {
                return {
                  returning: () =>
                    Promise.resolve([
                      { id: CAMPAIGN_ID, tenantId: TENANT_ID, ...campaignState },
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

beforeEach(() => {
  campaignState = { fase: 'aquecimento', tipo: 'lancamento', config: {} };
});

describe('transitionCampaignPhase', () => {
  it('advances aquecimento → carrinho_aberto', async () => {
    campaignState.fase = 'aquecimento';
    const { transitionCampaignPhase } = await import('../transition-campaign-phase.js');
    const result = await transitionCampaignPhase(TENANT_ID, CAMPAIGN_ID, 'carrinho_aberto');
    expect(result.fase).toBe('carrinho_aberto');
  });

  it('advances carrinho_aberto → downsell', async () => {
    campaignState.fase = 'carrinho_aberto';
    const { transitionCampaignPhase } = await import('../transition-campaign-phase.js');
    const result = await transitionCampaignPhase(TENANT_ID, CAMPAIGN_ID, 'downsell');
    expect(result.fase).toBe('downsell');
  });

  it('rejects invalid backward transition (carrinho_aberto → aquecimento)', async () => {
    campaignState.fase = 'carrinho_aberto';
    const { transitionCampaignPhase, InvalidPhaseTransitionError } = await import(
      '../transition-campaign-phase.js'
    );
    await expect(
      transitionCampaignPhase(TENANT_ID, CAMPAIGN_ID, 'aquecimento')
    ).rejects.toBeInstanceOf(InvalidPhaseTransitionError);
  });

  it('throws PerpetualCampaignTransitionError for tipo=perpetuo', async () => {
    campaignState.tipo = 'perpetuo';
    campaignState.fase = 'carrinho_aberto';
    const { transitionCampaignPhase, PerpetualCampaignTransitionError } = await import(
      '../transition-campaign-phase.js'
    );
    await expect(
      transitionCampaignPhase(TENANT_ID, CAMPAIGN_ID, 'downsell')
    ).rejects.toBeInstanceOf(PerpetualCampaignTransitionError);
  });
});
