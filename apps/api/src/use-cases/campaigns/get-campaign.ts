import { withTenant, schema, eq, and } from '@leedi/db';
import type { CampaignRow } from './get-campaigns.js';

export async function getCampaign(
  tenantId: string,
  campaignId: string
): Promise<CampaignRow | null> {
  return withTenant(tenantId, async (tx) => {
    const rows = await tx
      .select({
        id: schema.campaigns.id,
        tenantId: schema.campaigns.tenantId,
        nome: schema.campaigns.nome,
        produtoId: schema.campaigns.produtoId,
        produtoNome: schema.products.nome,
        tipo: schema.campaigns.tipo,
        fase: schema.campaigns.fase,
        dataInicio: schema.campaigns.dataInicio,
        dataFim: schema.campaigns.dataFim,
        status: schema.campaigns.status,
        config: schema.campaigns.config,
        createdAt: schema.campaigns.createdAt,
        updatedAt: schema.campaigns.updatedAt,
      })
      .from(schema.campaigns)
      .leftJoin(schema.products, eq(schema.campaigns.produtoId, schema.products.id))
      .where(
        and(eq(schema.campaigns.tenantId, tenantId), eq(schema.campaigns.id, campaignId))
      )
      .limit(1);

    return (rows[0] as CampaignRow) ?? null;
  });
}
