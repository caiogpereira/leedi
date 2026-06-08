import { withTenant, schema, eq, and } from '@leedi/db';
import { assertNoActiveCampaign } from './assert-no-active-campaign.js';
import type { CampaignRow } from './get-campaigns.js';

export async function activateCampaign(
  tenantId: string,
  campaignId: string
): Promise<CampaignRow> {
  await assertNoActiveCampaign(tenantId);

  return withTenant(tenantId, async (tx) => {
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
