import { withTenant, schema, eq, and } from '@leedi/db';
import type { CampaignRow } from './get-campaigns.js';

export async function pauseCampaign(
  tenantId: string,
  campaignId: string
): Promise<CampaignRow | null> {
  return withTenant(tenantId, async (tx) => {
    const [updated] = await tx
      .update(schema.campaigns)
      .set({ status: 'pausada' })
      .where(
        and(eq(schema.campaigns.tenantId, tenantId), eq(schema.campaigns.id, campaignId))
      )
      .returning();

    if (!updated) return null;
    return { ...(updated as unknown as CampaignRow), produtoNome: null };
  });
}
