import { z } from 'zod';
import { withTenant, schema, eq, and } from '@leedi/db';
import { ProductValidationError } from './create-product.js';

const stringArraySchema = z.array(z.string().min(1, 'Itens não podem estar vazios.')).default([]);

export const updateProductArgumentsSchema = z.object({
  tenantId: z.string().uuid(),
  productId: z.string().uuid(),
  field: z.enum(['argumentos', 'diferenciais', 'provasSociais', 'bonus']),
  items: stringArraySchema,
});

export type UpdateProductArgumentsInput = z.infer<typeof updateProductArgumentsSchema>;

const fieldToColumn = {
  argumentos: 'argumentos',
  diferenciais: 'diferenciais',
  provasSociais: 'provasSociais',
  bonus: 'bonus',
} as const;

export async function updateProductArguments(
  input: UpdateProductArgumentsInput
): Promise<boolean> {
  const parsed = updateProductArgumentsSchema.safeParse(input);
  if (!parsed.success) {
    const firstError = parsed.error.issues[0];
    throw new ProductValidationError(firstError?.message ?? 'Dados inválidos.');
  }

  const { tenantId, productId, field, items } = parsed.data;
  const col = fieldToColumn[field];

  return withTenant(tenantId, async (tx) => {
    const rows = await tx
      .update(schema.products)
      .set({ [col]: items })
      .where(and(eq(schema.products.id, productId), eq(schema.products.tenantId, tenantId)))
      .returning({ id: schema.products.id });

    return rows.length > 0;
  });
}
