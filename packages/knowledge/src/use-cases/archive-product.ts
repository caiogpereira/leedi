import { withTenant, schema, eq, and } from '@leedi/db';

export async function archiveProduct(tenantId: string, productId: string): Promise<boolean> {
  return withTenant(tenantId, async (tx) => {
    const rows = await tx
      .update(schema.products)
      .set({ ativo: false })
      .where(and(eq(schema.products.id, productId), eq(schema.products.tenantId, tenantId)))
      .returning({ id: schema.products.id });

    return rows.length > 0;
  });
}
