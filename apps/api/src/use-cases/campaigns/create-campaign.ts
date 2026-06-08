import { withTenant, schema } from '@leedi/db';
import { z } from 'zod';
import type { CampaignRow } from './get-campaigns.js';

export const CreateCampaignSchema = z.object({
  nome: z.string().min(1),
  tipo: z.enum(['lancamento', 'downsell', 'perpetuo']),
  produtoId: z.string().uuid().optional(),
  dataInicio: z.string().optional(),
  dataFim: z.string().optional(),
  config: z.record(z.string(), z.unknown()).optional(),
});

export type CreateCampaignInput = z.infer<typeof CreateCampaignSchema>;

export class CampaignValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CampaignValidationError';
  }
}

export async function createCampaign(
  tenantId: string,
  input: CreateCampaignInput
): Promise<CampaignRow> {
  return withTenant(tenantId, async (tx) => {
    const [created] = await tx
      .insert(schema.campaigns)
      .values({
        tenantId,
        nome: input.nome,
        tipo: input.tipo,
        produtoId: input.produtoId ?? null,
        fase: 'aquecimento',
        status: 'rascunho',
        dataInicio: input.dataInicio ? new Date(input.dataInicio) : null,
        dataFim: input.dataFim ? new Date(input.dataFim) : null,
        config: (input.config ?? {}) as Record<string, unknown>,
      })
      .returning();

    return {
      ...(created as unknown as CampaignRow),
      produtoNome: null,
    };
  });
}
