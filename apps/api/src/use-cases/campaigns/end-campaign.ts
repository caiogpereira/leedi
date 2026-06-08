import { withTenant, schema, eq, and } from '@leedi/db';
import type { CampaignRow } from './get-campaigns.js';

export class CampaignAlreadyEndedError extends Error {
  readonly statusCode = 409;

  constructor() {
    super('A campanha já foi encerrada.');
    this.name = 'CampaignAlreadyEndedError';
  }
}

export async function endCampaign(
  tenantId: string,
  campaignId: string
): Promise<CampaignRow | null> {
  return withTenant(tenantId, async (tx) => {
    const [existing] = await tx
      .select({ status: schema.campaigns.status })
      .from(schema.campaigns)
      .where(
        and(eq(schema.campaigns.tenantId, tenantId), eq(schema.campaigns.id, campaignId))
      )
      .limit(1);

    if (!existing) return null;
    if (existing.status === 'encerrada') throw new CampaignAlreadyEndedError();

    const [updated] = await tx
      .update(schema.campaigns)
      .set({ status: 'encerrada', fase: 'encerrada' })
      .where(
        and(eq(schema.campaigns.tenantId, tenantId), eq(schema.campaigns.id, campaignId))
      )
      .returning();

    if (!updated) return null;
    return { ...(updated as unknown as CampaignRow), produtoNome: null };
  });
}
