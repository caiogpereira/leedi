import { withTenant, schema, eq, and } from '@leedi/db';
import { z } from 'zod';
import type { CampaignRow } from './get-campaigns.js';
import { CampaignValidationError } from './create-campaign.js';
export { CampaignValidationError } from './create-campaign.js';

const PhaseTransitionSchema = z.object({
  tipo: z.enum(['manual', 'data']),
  data: z.string().optional(),
  scheduledJobId: z.string().optional(),
});

const PhaseConfigSchema = z.object({
  urgencia: z.string().optional(),
  mensagens_chave: z.array(z.string()).optional(),
  transicao: PhaseTransitionSchema.optional(),
});

const DownsellPhaseConfigSchema = PhaseConfigSchema.extend({
  produto_id: z.string().uuid().optional(),
});

export const CampaignConfigSchema = z.object({
  aquecimento: PhaseConfigSchema.optional(),
  carrinho_aberto: PhaseConfigSchema.optional(),
  downsell: DownsellPhaseConfigSchema.optional(),
});

export const UpdateCampaignSchema = z.object({
  nome: z.string().min(1).optional(),
  produtoId: z.string().uuid().nullable().optional(),
  dataInicio: z.string().nullable().optional(),
  dataFim: z.string().nullable().optional(),
  config: CampaignConfigSchema.optional(),
});

export type UpdateCampaignInput = z.infer<typeof UpdateCampaignSchema>;
export type CampaignConfig = z.infer<typeof CampaignConfigSchema>;

export async function updateCampaign(
  tenantId: string,
  campaignId: string,
  input: UpdateCampaignInput
): Promise<CampaignRow | null> {
  const parsed = UpdateCampaignSchema.safeParse(input);
  if (!parsed.success) {
    throw new CampaignValidationError(parsed.error.message);
  }

  return withTenant(tenantId, async (tx) => {
    const updateValues: Record<string, unknown> = {};
    if (parsed.data.nome !== undefined) updateValues.nome = parsed.data.nome;
    if ('produtoId' in parsed.data) updateValues.produtoId = parsed.data.produtoId;
    if ('dataInicio' in parsed.data) {
      updateValues.dataInicio = parsed.data.dataInicio ? new Date(parsed.data.dataInicio) : null;
    }
    if ('dataFim' in parsed.data) {
      updateValues.dataFim = parsed.data.dataFim ? new Date(parsed.data.dataFim) : null;
    }
    if (parsed.data.config !== undefined) updateValues.config = parsed.data.config;

    if (Object.keys(updateValues).length === 0) {
      return null;
    }

    const [updated] = await tx
      .update(schema.campaigns)
      .set(updateValues)
      .where(
        and(eq(schema.campaigns.tenantId, tenantId), eq(schema.campaigns.id, campaignId))
      )
      .returning();

    if (!updated) return null;

    return {
      ...(updated as unknown as CampaignRow),
      produtoNome: null,
    };
  });
}
