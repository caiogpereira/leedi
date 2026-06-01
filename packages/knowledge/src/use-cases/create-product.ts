import { z } from 'zod';
import { withTenant, schema } from '@leedi/db';

export class ProductValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProductValidationError';
  }
}

export const createProductSchema = z.object({
  tenantId: z.string().uuid(),
  nome: z.string().min(1),
  descricao: z.string().optional(),
  preco: z.coerce.number().positive({ message: 'O preço deve ser maior que zero.' }),
  parcelas: z.coerce.number().int().positive().optional(),
  precoParcelado: z.coerce.number().positive().optional(),
  linkCheckout: z.string().url({ message: 'O link de checkout é obrigatório para que o agente possa enviar ao lead.' }),
  tipo: z.enum(['principal', 'downsell', 'upsell', 'orderbump']).default('principal'),
  gatewayProductId: z.string().optional(),
});

export type CreateProductInput = z.infer<typeof createProductSchema>;

export interface ProductRow {
  id: string;
  tenantId: string;
  nome: string;
  descricao: string | null;
  preco: string;
  parcelas: number | null;
  precoParcelado: string | null;
  linkCheckout: string;
  tipo: 'principal' | 'downsell' | 'upsell' | 'orderbump';
  argumentos: string[];
  diferenciais: string[];
  provasSociais: string[];
  garantia: string | null;
  bonus: string[];
  gatewayProductId: string | null;
  ativo: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export async function createProduct(input: CreateProductInput): Promise<ProductRow> {
  const parsed = createProductSchema.safeParse(input);
  if (!parsed.success) {
    const firstError = parsed.error.issues[0];
    throw new ProductValidationError(firstError?.message ?? 'Dados inválidos.');
  }

  const { tenantId, nome, descricao, preco, parcelas, precoParcelado, linkCheckout, tipo, gatewayProductId } = parsed.data;

  return withTenant(tenantId, async (tx) => {
    const rows = await tx
      .insert(schema.products)
      .values({
        tenantId,
        nome,
        descricao,
        preco: String(preco),
        parcelas,
        precoParcelado: precoParcelado != null ? String(precoParcelado) : null,
        linkCheckout,
        tipo,
        gatewayProductId,
      })
      .returning();

    return rows[0] as ProductRow;
  });
}
