import { withTenant, withServiceRole, schema, eq, and, desc } from '@leedi/db';
import { PLAN_LIMITS } from '../constants.js';
import { currentPeriod } from './increment-usage.js';

export interface UsageCounter {
  periodo: string;
  conversasUsadas: number;
  conversasLimite: number;
  overageConversas: number;
  overageValor: string;
  /** Percentage (0-100+), integer. */
  pct: number;
  /** True when bloquear=true AND conversasUsadas >= conversasLimite. */
  blocked: boolean;
  /** From tenants.config — for settings UI initialization. */
  bloquearAoAtingirLimite: boolean;
  /** From tenants.config — for settings UI initialization. */
  notificarOverageA: number;
}

export interface GetUsageCounterInput {
  tenantId: string;
  periodo?: string;
}

/**
 * Returns the usage counter for a tenant and period (defaults to current month).
 * Does NOT expose custoIaUsd — tenant-facing API only.
 */
export async function getUsageCounter(
  input: GetUsageCounterInput
): Promise<UsageCounter | null> {
  const { tenantId } = input;
  const periodo = input.periodo ?? currentPeriod();

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

  const row = await withTenant(tenantId, async (tx) => {
    const [r] = await tx
      .select({
        conversasUsadas: schema.usageCounters.conversasUsadas,
        conversasLimite: schema.usageCounters.conversasLimite,
        overageConversas: schema.usageCounters.overageConversas,
        overageValor: schema.usageCounters.overageValor,
      })
      .from(schema.usageCounters)
      .where(
        and(
          eq(schema.usageCounters.tenantId, tenantId),
          eq(schema.usageCounters.periodo, periodo)
        )
      )
      .limit(1);
    return r ?? null;
  });

  const notificarA = tenantConfig['notificar_overage_a_cada'] !== undefined
    ? Number(tenantConfig['notificar_overage_a_cada'])
    : 100;

  if (!row) {
    return {
      periodo,
      conversasUsadas: 0,
      conversasLimite,
      overageConversas: 0,
      overageValor: '0.00',
      pct: 0,
      blocked: false,
      bloquearAoAtingirLimite: bloquear,
      notificarOverageA: notificarA,
    };
  }

  const pct = Math.floor((row.conversasUsadas / row.conversasLimite) * 100);
  const blocked = bloquear && row.conversasUsadas >= row.conversasLimite;

  return {
    periodo,
    conversasUsadas: row.conversasUsadas,
    conversasLimite: row.conversasLimite,
    overageConversas: row.overageConversas,
    overageValor: row.overageValor ?? '0.00',
    pct,
    blocked,
    bloquearAoAtingirLimite: bloquear,
    notificarOverageA: notificarA,
  };
}

/** Returns the last N usage_counters records for a tenant (for history table). */
export async function getUsageHistory(
  tenantId: string,
  limit = 6
): Promise<UsageCounter[]> {
  const rows = await withTenant(tenantId, async (tx) =>
    tx
      .select({
        periodo: schema.usageCounters.periodo,
        conversasUsadas: schema.usageCounters.conversasUsadas,
        conversasLimite: schema.usageCounters.conversasLimite,
        overageConversas: schema.usageCounters.overageConversas,
        overageValor: schema.usageCounters.overageValor,
      })
      .from(schema.usageCounters)
      .where(eq(schema.usageCounters.tenantId, tenantId))
      .orderBy(desc(schema.usageCounters.periodo))
      .limit(limit)
  );

  return rows.map((r) => ({
    ...r,
    overageValor: r.overageValor ?? '0.00',
    pct: Math.floor((r.conversasUsadas / r.conversasLimite) * 100),
    blocked: false,
    bloquearAoAtingirLimite: false,
    notificarOverageA: 100,
  }));
}

/** Super-admin only: returns custo_ia_usd for a tenant + period. */
export async function getCustoIaUsd(tenantId: string, periodo?: string): Promise<string | null> {
  const p = periodo ?? currentPeriod();
  const row = await withServiceRole(async (tx) => {
    const [r] = await tx
      .select({ custoIaUsd: schema.usageCounters.custoIaUsd })
      .from(schema.usageCounters)
      .where(
        and(
          eq(schema.usageCounters.tenantId, tenantId),
          eq(schema.usageCounters.periodo, p)
        )
      )
      .limit(1);
    return r ?? null;
  });
  return row?.custoIaUsd ?? null;
}
