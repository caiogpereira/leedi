import { withTenant, schema, eq, and } from '@leedi/db';
import type { ProductRow } from './create-product.js';

export interface ListProductsInput {
  tenantId: string;
  archived?: boolean;
}

export async function listProducts(input: ListProductsInput): Promise<ProductRow[]> {
  const { tenantId, archived = false } = input;

  return withTenant(tenantId, async (tx) => {
    const rows = await tx
      .select()
      .from(schema.products)
      .where(
        and(
          eq(schema.products.tenantId, tenantId),
          eq(schema.products.ativo, !archived)
        )
      )
      .orderBy(schema.products.createdAt);

    return rows as ProductRow[];
  });
}
