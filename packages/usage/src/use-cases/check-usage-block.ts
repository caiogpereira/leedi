import { withTenant, schema, eq, and } from '@leedi/db';
import { PLAN_LIMITS } from '../constants.js';
import { currentPeriod } from './increment-usage.js';

export interface UsageBlockResult {
  blocked: boolean;
  conversasUsadas: number;
  conversasLimite: number;
}

/**
 * Read-only check: returns true when the tenant opted in to blocking
 * (bloquear_ao_atingir_limite = true) AND the limit is already reached.
 * Does NOT increment anything — safe to call before resolveConversationWindow.
 */
export async function checkUsageBlock(tenantId: string): Promise<UsageBlockResult> {
  const periodo = currentPeriod();

  const tenantRow = await withTenant(tenantId, async (tx) => {
    const [row] = await tx
      .select({ plan: schema.tenants.plan, config: schema.tenants.config })
      .from(schema.tenants)
      .where(eq(schema.tenants.id, tenantId))
      .limit(1);
    return row;
  });

  const plan = tenantRow?.plan ?? 'starter';
  const conversasLimite = PLAN_LIMITS[plan] ?? PLAN_LIMITS['starter']!;
  const tenantConfig = (tenantRow?.config ?? {}) as Record<string, unknown>;
  const bloquear = tenantConfig['bloquear_ao_atingir_limite'] === true;

  const counter = await withTenant(tenantId, async (tx) => {
    const [row] = await tx
      .select({ conversasUsadas: schema.usageCounters.conversasUsadas })
      .from(schema.usageCounters)
      .where(
        and(
          eq(schema.usageCounters.tenantId, tenantId),
          eq(schema.usageCounters.periodo, periodo)
        )
      )
      .limit(1);
    return row ?? null;
  });

  const conversasUsadas = counter?.conversasUsadas ?? 0;
  const blocked = bloquear && conversasUsadas >= conversasLimite;

  return { blocked, conversasUsadas, conversasLimite };
}
