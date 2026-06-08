import { describe, it, expect, vi } from 'vitest';

const TENANT_ID = '11111111-1111-4111-8111-111111111111';
const CAMPAIGN_ID = '22222222-2222-4222-8222-222222222222';

vi.mock('@leedi/db', () => {
  const tx = {
    update: () => ({
      set(v: unknown) {
        return {
          where() {
            return {
              returning() {
                return Promise.resolve([
                  {
                    id: CAMPAIGN_ID,
                    tenantId: TENANT_ID,
                    config: v,
                    fase: 'aquecimento',
                    status: 'rascunho',
                    createdAt: new Date(),
                    updatedAt: new Date(),
                  },
                ]);
              },
            };
          },
        };
      },
    }),
  };

  return {
    withTenant: vi.fn((_id: string, fn: (t: typeof tx) => unknown) => fn(tx)),
    schema: { campaigns: { __name: 'campaigns' } },
    eq: vi.fn((_a: unknown, _b: unknown) => ({})),
    and: vi.fn((...args: unknown[]) => args),
  };
});

describe('updateCampaign config validation', () => {
  it('accepts valid PhaseConfig shape', async () => {
    const { updateCampaign } = await import('../update-campaign.js');
    const validConfig = {
      aquecimento: {
        urgencia: 'Não perca!',
        mensagens_chave: ['Bônus exclusivo'],
        transicao: { tipo: 'manual' as const },
      },
    };
    await expect(
      updateCampaign(TENANT_ID, CAMPAIGN_ID, { config: validConfig })
    ).resolves.toBeDefined();
  });

  it('rejects invalid config shape — bad transicao.tipo enum value', async () => {
    const { updateCampaign, CampaignValidationError } = await import('../update-campaign.js');
    const invalidConfig = {
      aquecimento: {
        transicao: { tipo: 'invalid-type' as unknown as 'manual' },
      },
    };
    await expect(
      updateCampaign(TENANT_ID, CAMPAIGN_ID, { config: invalidConfig as never })
    ).rejects.toBeInstanceOf(CampaignValidationError);
  });

  it('accepts downsell config with produto_id UUID', async () => {
    const { updateCampaign } = await import('../update-campaign.js');
    const config = {
      downsell: {
        produto_id: '33333333-3333-4333-8333-333333333333',
        urgencia: 'Última chance!',
      },
    };
    await expect(
      updateCampaign(TENANT_ID, CAMPAIGN_ID, { config })
    ).resolves.toBeDefined();
  });

  it('rejects downsell produto_id that is not a valid UUID', async () => {
    const { updateCampaign, CampaignValidationError } = await import('../update-campaign.js');
    const config = {
      downsell: { produto_id: 'not-a-uuid' },
    };
    await expect(
      updateCampaign(TENANT_ID, CAMPAIGN_ID, { config })
    ).rejects.toBeInstanceOf(CampaignValidationError);
  });
});
