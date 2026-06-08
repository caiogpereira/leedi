import { withTenant, schema, eq, sql } from '@leedi/db';

export interface AgentConfigRow {
  id: string;
  tenantId: string;
  nomeAgente: string;
  persona: string;
  estiloMensagem: {
    tamanho: 'curto' | 'medio' | 'longo';
    formalidade: 'formal' | 'informal';
    emoji: boolean;
  };
  limites: string;
  salesMethodId: string | null;
  modeloIa: 'sonnet' | 'haiku' | 'opus';
  toolsHabilitadas: {
    consultar_base_conhecimento: boolean;
    agendar_followup: boolean;
    transferir_humano: boolean;
    adicionar_tag: boolean;
    solicitar_reengajamento: boolean;
  };
  ativo: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Returns the tenant's agent_config, creating the default if none exists (AC#2).
 *
 * WARNING-4 FIX: on first creation, migrate the temporary
 * tenants.config.tenant_sales_method_preference (set by Story 6.4's UI) into
 * agent_configs.sales_method_id, then remove the temporary key. This runs inside the
 * SAME transaction as the upsert so no data is lost or left inconsistent.
 *
 * The DB UNIQUE(tenant_id) makes a naive select-then-insert racy, so we use
 * onConflictDoNothing on the insert and re-select to converge.
 */
export async function getOrCreateAgentConfig(tenantId: string): Promise<AgentConfigRow> {
  return withTenant(tenantId, async (tx) => {
    const existing = await tx
      .select()
      .from(schema.agentConfigs)
      .where(eq(schema.agentConfigs.tenantId, tenantId))
      .limit(1);

    if (existing[0]) {
      return existing[0] as AgentConfigRow;
    }

    // Read the temporary sales-method preference left by Story 6.4.
    const tenantRows = await tx
      .select({ config: schema.tenants.config })
      .from(schema.tenants)
      .where(eq(schema.tenants.id, tenantId))
      .limit(1);

    const config = (tenantRows[0]?.config as Record<string, unknown>) ?? {};
    const preferredSalesMethodId =
      typeof config.tenant_sales_method_preference === 'string'
        ? (config.tenant_sales_method_preference as string)
        : null;

    await tx
      .insert(schema.agentConfigs)
      .values({
        tenantId,
        ...(preferredSalesMethodId ? { salesMethodId: preferredSalesMethodId } : {}),
      })
      .onConflictDoNothing({ target: schema.agentConfigs.tenantId });

    // Remove the temporary preference key now that it lives in agent_configs.
    if (preferredSalesMethodId) {
      await tx
        .update(schema.tenants)
        .set({ config: sql`${schema.tenants.config} - 'tenant_sales_method_preference'` })
        .where(eq(schema.tenants.id, tenantId));
    }

    const created = await tx
      .select()
      .from(schema.agentConfigs)
      .where(eq(schema.agentConfigs.tenantId, tenantId))
      .limit(1);

    return created[0] as AgentConfigRow;
  });
}
