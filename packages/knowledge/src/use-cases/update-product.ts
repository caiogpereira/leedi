import { z } from 'zod';
import { withTenant, schema, eq, and } from '@leedi/db';
import type { ProductRow } from './create-product.js';
import { ProductValidationError } from './create-product.js';

export const updateProductSchema = z.object({
  tenantId: z.string().uuid(),
  productId: z.string().uuid(),
  nome: z.string().min(1).optional(),
  descricao: z.string().optional().nullable(),
  preco: z.coerce.number().positive().optional(),
  parcelas: z.coerce.number().int().positive().optional().nullable(),
  precoParcelado: z.coerce.number().positive().optional().nullable(),
  linkCheckout: z.string().url({ message: 'O link de checkout é obrigatório para que o agente possa enviar ao lead.' }).optional(),
  tipo: z.enum(['principal', 'downsell', 'upsell', 'orderbump']).optional(),
  gatewayProductId: z.string().optional().nullable(),
  garantia: z.string().optional().nullable(),
});

export type UpdateProductInput = z.infer<typeof updateProductSchema>;

export async function updateProduct(input: UpdateProductInput): Promise<ProductRow | null> {
  const parsed = updateProductSchema.safeParse(input);
  if (!parsed.success) {
    const firstError = parsed.error.issues[0];
    throw new ProductValidationError(firstError?.message ?? 'Dados inválidos.');
  }

  const { tenantId, productId, preco, precoParcelado, ...rest } = parsed.data;

  return withTenant(tenantId, async (tx) => {
    const rows = await tx
      .update(schema.products)
      .set({
        ...rest,
        ...(preco != null ? { preco: String(preco) } : {}),
        ...(precoParcelado != null ? { precoParcelado: String(precoParcelado) } : {}),
      })
      .where(and(eq(schema.products.id, productId), eq(schema.products.tenantId, tenantId)))
      .returning();

    return (rows[0] as ProductRow) ?? null;
  });
}
