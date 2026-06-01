import { withTenant, schema, eq, and } from '@leedi/db';
import type { ProductRow } from './create-product.js';

export async function getProduct(tenantId: string, productId: string): Promise<ProductRow | null> {
  return withTenant(tenantId, async (tx) => {
    const rows = await tx
      .select()
      .from(schema.products)
      .where(and(eq(schema.products.id, productId), eq(schema.products.tenantId, tenantId)))
      .limit(1);

    return (rows[0] as ProductRow) ?? null;
  });
}
