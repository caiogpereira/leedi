import { withTenant, schema, eq, and } from '@leedi/db';

export interface ProductMaterial {
  nome: string;
  materialLancamento: string | null;
}

/**
 * Returns a product's launch material (CPL/VSL scripts, gatilhos) for on-demand
 * agent consultation, or null when the product doesn't exist / isn't active.
 */
export async function getProductMaterial(
  tenantId: string,
  productId: string
): Promise<ProductMaterial | null> {
  return withTenant(tenantId, async (tx) => {
    const rows = await tx
      .select({ nome: schema.products.nome, materialLancamento: schema.products.materialLancamento })
      .from(schema.products)
      .where(
        and(
          eq(schema.products.tenantId, tenantId),
          eq(schema.products.id, productId),
          eq(schema.products.ativo, true)
        )
      )
      .limit(1);

    return (rows[0] as ProductMaterial) ?? null;
  });
}
