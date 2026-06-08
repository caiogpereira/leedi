import { withTenant, schema, eq, and } from '@leedi/db';
import type { CampaignRow } from './get-campaigns.js';

type CampaignFase = 'aquecimento' | 'carrinho_aberto' | 'downsell' | 'encerrada';

const VALID_TRANSITIONS: Record<CampaignFase, CampaignFase | null> = {
  aquecimento: 'carrinho_aberto',
  carrinho_aberto: 'downsell',
  downsell: null,
  encerrada: null,
};

export class InvalidPhaseTransitionError extends Error {
  constructor(from: string, to: string) {
    super(`Transição de fase inválida: ${from} → ${to}.`);
    this.name = 'InvalidPhaseTransitionError';
  }
}

export class PerpetualCampaignTransitionError extends Error {
  constructor() {
    super(
      'Campanhas perpétuas não possuem fases de lançamento e não podem fazer transição de fase.'
    );
    this.name = 'PerpetualCampaignTransitionError';
  }
}

export async function transitionCampaignPhase(
  tenantId: string,
  campaignId: string,
  targetPhase: string
): Promise<CampaignRow> {
  return withTenant(tenantId, async (tx) => {
    const [campaign] = await tx
      .select({
        fase: schema.campaigns.fase,
        tipo: schema.campaigns.tipo,
        config: schema.campaigns.config,
      })
      .from(schema.campaigns)
      .where(
        and(eq(schema.campaigns.tenantId, tenantId), eq(schema.campaigns.id, campaignId))
      )
      .limit(1);

    if (!campaign) throw new Error('Campanha não encontrada.');
    if (campaign.tipo === 'perpetuo') throw new PerpetualCampaignTransitionError();

    const expectedNext = VALID_TRANSITIONS[campaign.fase as CampaignFase];
    if (!expectedNext || expectedNext !== targetPhase) {
      throw new InvalidPhaseTransitionError(campaign.fase, targetPhase);
    }

    const [updated] = await tx
      .update(schema.campaigns)
      .set({ fase: targetPhase as CampaignFase })
      .where(
        and(eq(schema.campaigns.tenantId, tenantId), eq(schema.campaigns.id, campaignId))
      )
      .returning();

    return { ...(updated as unknown as CampaignRow), produtoNome: null };
  });
}
