import { withTenant, schema, eq, and } from '@leedi/db';

export interface ActiveOffer {
  id: string;
  nome: string;
  preco: string;
  precoParcelado: string | null;
  parcelas: number | null;
  linkCheckout: string;
  tipo: 'principal' | 'downsell' | 'upsell' | 'orderbump';
  argumentos: string[];
  diferenciais: string[];
  provasSociais: string[];
  garantia: string | null;
  bonus: string[];
  gatewayProductId: string | null;
}

/**
 * Agent tool: consultar_ofertas_ativas
 * Returns all active products for the tenant. If activeCampaignPhaseId is
 * provided in the future, filtering by phase scope will be added here.
 */
export async function getActiveOffers(
  tenantId: string,
  _activeCampaignPhaseId?: string
): Promise<ActiveOffer[]> {
  return withTenant(tenantId, async (tx) => {
    const rows = await tx
      .select({
        id: schema.products.id,
        nome: schema.products.nome,
        preco: schema.products.preco,
        precoParcelado: schema.products.precoParcelado,
        parcelas: schema.products.parcelas,
        linkCheckout: schema.products.linkCheckout,
        tipo: schema.products.tipo,
        argumentos: schema.products.argumentos,
        diferenciais: schema.products.diferenciais,
        provasSociais: schema.products.provasSociais,
        garantia: schema.products.garantia,
        bonus: schema.products.bonus,
        gatewayProductId: schema.products.gatewayProductId,
      })
      .from(schema.products)
      .where(and(eq(schema.products.tenantId, tenantId), eq(schema.products.ativo, true)));

    return rows as ActiveOffer[];
  });
}
