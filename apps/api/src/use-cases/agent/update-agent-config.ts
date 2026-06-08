import { z } from 'zod';
import { withTenant, schema, eq } from '@leedi/db';
import type { AgentConfigRow } from './get-or-create-agent-config.js';
import { getOrCreateAgentConfig } from './get-or-create-agent-config.js';

export class AgentConfigValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AgentConfigValidationError';
  }
}

const estiloMensagemSchema = z.object({
  tamanho: z.enum(['curto', 'medio', 'longo']),
  formalidade: z.enum(['formal', 'informal']),
  emoji: z.boolean(),
});

const toolsHabilitadasSchema = z.object({
  consultar_base_conhecimento: z.boolean(),
  agendar_followup: z.boolean(),
  transferir_humano: z.boolean(),
  adicionar_tag: z.boolean(),
  solicitar_reengajamento: z.boolean(),
});

// All fields optional — PATCH semantics. Only provided keys are updated.
export const updateAgentConfigSchema = z
  .object({
    nomeAgente: z.string().min(1, { message: 'O nome do agente é obrigatório.' }).max(80),
    persona: z.string().max(4000),
    estiloMensagem: estiloMensagemSchema,
    limites: z.string().max(4000),
    // null clears the method; a uuid sets it (FK validated by the DB).
    salesMethodId: z.string().uuid().nullable(),
    modeloIa: z.enum(['sonnet', 'haiku', 'opus']),
    toolsHabilitadas: toolsHabilitadasSchema,
    ativo: z.boolean(),
  })
  .partial();

export type UpdateAgentConfigInput = z.infer<typeof updateAgentConfigSchema>;

/**
 * Updates the tenant's agent_config (AC#3). Ensures the config exists first
 * (upserting the default), then applies the validated partial update.
 * All writes go through withTenant so RLS + the FK on sales_method_id are enforced.
 */
export async function updateAgentConfig(
  tenantId: string,
  input: unknown
): Promise<AgentConfigRow> {
  const parsed = updateAgentConfigSchema.safeParse(input);
  if (!parsed.success) {
    const firstError = parsed.error.issues[0];
    throw new AgentConfigValidationError(firstError?.message ?? 'Dados inválidos.');
  }

  // Guarantee a row exists (handles the case where PATCH is the first write).
  await getOrCreateAgentConfig(tenantId);

  const updates = parsed.data;
  if (Object.keys(updates).length === 0) {
    // Nothing to change — return current state.
    return getOrCreateAgentConfig(tenantId);
  }

  return withTenant(tenantId, async (tx) => {
    const rows = await tx
      .update(schema.agentConfigs)
      .set(updates)
      .where(eq(schema.agentConfigs.tenantId, tenantId))
      .returning();

    return rows[0] as AgentConfigRow;
  });
}
