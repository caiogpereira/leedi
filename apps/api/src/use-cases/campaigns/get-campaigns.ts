import { withTenant, schema, eq, and } from '@leedi/db';

export interface CampaignRow {
  id: string;
  tenantId: string;
  nome: string;
  produtoId: string | null;
  produtoNome: string | null;
  tipo: 'lancamento' | 'downsell' | 'perpetuo';
  fase: 'aquecimento' | 'carrinho_aberto' | 'downsell' | 'encerrada';
  dataInicio: Date | null;
  dataFim: Date | null;
  status: 'rascunho' | 'ativa' | 'pausada' | 'encerrada';
  config: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export async function getCampaigns(
  tenantId: string,
  filters?: { status?: string }
): Promise<CampaignRow[]> {
  return withTenant(tenantId, async (tx) => {
    const conditions = [eq(schema.campaigns.tenantId, tenantId)];
    if (filters?.status) {
      conditions.push(
        eq(schema.campaigns.status, filters.status as CampaignRow['status'])
      );
    }

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
      .where(and(...conditions));

    return rows as CampaignRow[];
  });
}
