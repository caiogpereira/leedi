import { withTenant, schema, eq, and } from '@leedi/db';
import { assertNoActiveCampaign } from './assert-no-active-campaign.js';
import type { CampaignRow } from './get-campaigns.js';

/**
 * Thrown when an attempt is made to reactivate a campaign whose status is
 * `encerrada` — a terminal state per Story 10.2 AC#7. Enforced at the API layer.
 */
export class CampaignEndedCannotReactivateError extends Error {
  readonly statusCode = 409;

  constructor() {
    super(
      'Campanha encerrada não pode ser reativada. Crie uma nova campanha para continuar.'
    );
    this.name = 'CampaignEndedCannotReactivateError';
  }
}

export async function activateCampaign(
  tenantId: string,
  campaignId: string
): Promise<CampaignRow> {
  await assertNoActiveCampaign(tenantId);

  return withTenant(tenantId, async (tx) => {
    const [existing] = await tx
      .select({ status: schema.campaigns.status })
      .from(schema.campaigns)
      .where(
        and(eq(schema.campaigns.tenantId, tenantId), eq(schema.campaigns.id, campaignId))
      )
      .limit(1);

    if (!existing) throw new Error('Campanha não encontrada.');
    if (existing.status === 'encerrada') throw new CampaignEndedCannotReactivateError();

    const [updated] = await tx
      .update(schema.campaigns)
      .set({ status: 'ativa' })
      .where(
        and(eq(schema.campaigns.tenantId, tenantId), eq(schema.campaigns.id, campaignId))
      )
      .returning();

    if (!updated) throw new Error('Campanha não encontrada.');
    return { ...(updated as unknown as CampaignRow), produtoNome: null };
  });
}
