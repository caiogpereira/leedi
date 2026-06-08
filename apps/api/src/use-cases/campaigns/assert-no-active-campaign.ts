import { withTenant, schema, eq, and } from '@leedi/db';

export class ActiveCampaignConflictError extends Error {
  readonly statusCode = 409;

  constructor() {
    super(
      'Já existe uma campanha ativa. Pause ou encerre a campanha atual antes de ativar outra.'
    );
    this.name = 'ActiveCampaignConflictError';
  }
}

/**
 * Throws ActiveCampaignConflictError if the tenant already has a campaign
 * with status='ativa'. Should be called inside a DB transaction when atomicity
 * is required — the partial unique index on campaigns(tenant_id) WHERE status='ativa'
 * is the last-line guard at the DB level.
 */
export async function assertNoActiveCampaign(tenantId: string): Promise<void> {
  await withTenant(tenantId, async (tx) => {
    const rows = await tx
      .select({ id: schema.campaigns.id })
      .from(schema.campaigns)
      .where(
        and(
          eq(schema.campaigns.tenantId, tenantId),
          eq(schema.campaigns.status, 'ativa')
        )
      )
      .limit(1);

    if (rows.length > 0) {
      throw new ActiveCampaignConflictError();
    }
  });
}
