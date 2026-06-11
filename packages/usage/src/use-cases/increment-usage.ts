import { withTenant, schema, sql, eq, and } from '@leedi/db';
import { PLAN_LIMITS, OVERAGE_PRICE_BRL, USAGE_ALERT_THRESHOLDS } from '../constants.js';

export interface IncrementUsageInput {
  tenantId: string;
  billable: boolean;
  /** AI cost in USD for the current agent response, if any. */
  aiCostUsd?: number;
}

/** A notification the caller should fire after the increment completes. */
export interface AlertDue {
  tipo: 'alerta_uso' | 'alerta_overage';
  titulo: string;
  corpo: string;
}

export interface IncrementUsageResult {
  /** True when bloquear_ao_atingir_limite=true and the limit is already reached. */
  blocked: boolean;
  /** Notifications the caller must dispatch (keeps usage free of @leedi/notification). */
  alertsDue: AlertDue[];
}

/**
 * Atomically increments usage counters for the current billing period.
 *
 * Increment only fires on the CREATE-NEW-WINDOW path (billable=true).
 * AI cost (aiCostUsd) accumulates regardless of billable flag.
 *
 * Returns { blocked: true } when the tenant opted in to blocking and the limit
 * is already reached — the caller must NOT create the conversation window.
 */
export async function incrementUsage(
  input: IncrementUsageInput
): Promise<IncrementUsageResult> {
  const { tenantId, billable, aiCostUsd } = input;
  const periodo = currentPeriod();

  // Read tenant plan + config to get the limit and block preference.
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
  const notificarA100 = tenantConfig['notificar_overage_a_cada'] !== undefined
    ? Number(tenantConfig['notificar_overage_a_cada'])
    : 100;

  // Read current counter for the period.
  const existing = await withTenant(tenantId, async (tx) => {
    const [row] = await tx
      .select({
        conversasUsadas: schema.usageCounters.conversasUsadas,
        overageConversas: schema.usageCounters.overageConversas,
        overageValor: schema.usageCounters.overageValor,
        alertasEnviados: schema.usageCounters.alertasEnviados,
      })
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

  const currentUsadas = existing?.conversasUsadas ?? 0;

  // Block check (16.3 AC#2): if already at or over limit and block is ON, skip creation.
  if (billable && bloquear && currentUsadas >= conversasLimite) {
    console.info('[usage] tenant', tenantId, 'at limit, blocking new conversation');
    return { blocked: true, alertsDue: [] };
  }

  // Perform atomic upsert.
  await withTenant(tenantId, async (tx) => {
    const aiCostSql = aiCostUsd != null && aiCostUsd > 0
      ? sql`, "custo_ia_usd" = "usage_counters"."custo_ia_usd" + ${aiCostUsd}`
      : sql``;

    if (!billable) {
      // Non-billable: only update AI cost if provided.
      if (aiCostUsd != null && aiCostUsd > 0) {
        await tx.execute(sql`
          INSERT INTO "usage_counters" (
            "tenant_id", "periodo", "conversas_limite", "custo_ia_usd", "updated_at"
          ) VALUES (
            ${tenantId}, ${periodo}, ${conversasLimite}, ${aiCostUsd}, now()
          )
          ON CONFLICT ("tenant_id", "periodo") DO UPDATE SET
            "custo_ia_usd" = "usage_counters"."custo_ia_usd" + ${aiCostUsd},
            "updated_at"   = now()
        `);
      }
      return;
    }

    // Billable: increment conversas_usadas or overage_conversas depending on limit.
    await tx.execute(sql`
      INSERT INTO "usage_counters" (
        "tenant_id", "periodo", "conversas_usadas", "conversas_limite", "updated_at"
      ) VALUES (
        ${tenantId}, ${periodo}, 1, ${conversasLimite}, now()
      )
      ON CONFLICT ("tenant_id", "periodo") DO UPDATE SET
        "conversas_usadas" = CASE
          WHEN "usage_counters"."conversas_usadas" < "usage_counters"."conversas_limite"
          THEN "usage_counters"."conversas_usadas" + 1
          ELSE "usage_counters"."conversas_usadas"
        END,
        "overage_conversas" = CASE
          WHEN "usage_counters"."conversas_usadas" >= "usage_counters"."conversas_limite"
          THEN "usage_counters"."overage_conversas" + 1
          ELSE "usage_counters"."overage_conversas"
        END,
        "overage_valor" = CASE
          WHEN "usage_counters"."conversas_usadas" >= "usage_counters"."conversas_limite"
          THEN "usage_counters"."overage_valor" + ${OVERAGE_PRICE_BRL}
          ELSE "usage_counters"."overage_valor"
        END,
        "updated_at" = now()
        ${aiCostSql}
    `);
  });

  // Re-read updated row to compute alerts.
  const updated = await withTenant(tenantId, async (tx) => {
    const [row] = await tx
      .select({
        conversasUsadas: schema.usageCounters.conversasUsadas,
        overageConversas: schema.usageCounters.overageConversas,
        overageValor: schema.usageCounters.overageValor,
        alertasEnviados: schema.usageCounters.alertasEnviados,
      })
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

  const alertsDue: AlertDue[] = [];

  if (!billable || !updated) return { blocked: false, alertsDue };

  const sent = (updated.alertasEnviados ?? []) as string[];
  const pct = Math.floor((updated.conversasUsadas / conversasLimite) * 100);

  // Candidate alerts as {key, alert}. The `alertas_enviados` jsonb is the source
  // of truth for dedup: an alert is only dispatched when its key is *atomically*
  // inserted by THIS call (guarded UPDATE ... RETURNING), so two concurrent
  // increments can never both fire the same notification.
  const candidates: { key: string; alert: AlertDue }[] = [];

  // Threshold alerts (16.2 AC#4,#5,#6)
  for (const threshold of USAGE_ALERT_THRESHOLDS) {
    if (pct >= threshold) {
      candidates.push({
        key: String(threshold),
        alert: {
          tipo: 'alerta_uso',
          titulo: `Uso em ${threshold}%`,
          corpo: `Você usou ${threshold}% das suas conversas do mês.`,
        },
      });
    }
  }

  // Overage milestone alerts (16.3 AC#4). notificarA100 <= 0 means the tenant
  // disabled overage notifications — skip (also avoids a divide-by-zero).
  const newOverageValor = parseFloat(String(updated.overageValor ?? '0'));
  if (notificarA100 > 0 && newOverageValor > 0) {
    const prevOverageValor = newOverageValor - OVERAGE_PRICE_BRL;
    const newMilestone = Math.floor(newOverageValor / notificarA100) * notificarA100;
    const prevMilestone = Math.floor(prevOverageValor / notificarA100) * notificarA100;
    if (newMilestone > prevMilestone && newMilestone > 0) {
      candidates.push({
        key: `overage_brl_${newMilestone}`,
        alert: {
          tipo: 'alerta_overage',
          titulo: `Overage: R$ ${newMilestone},00 extras`,
          corpo: `Você excedeu seu limite em ${updated.overageConversas} conversas excedentes (R$ ${newMilestone},00 adicionais).`,
        },
      });
    }
  }

  // Dispatch only the keys this call newly persisted. The fast path skips keys
  // already present; the authoritative gate is the guarded UPDATE's RETURNING.
  for (const { key, alert } of candidates) {
    if (sent.includes(key)) continue;
    const inserted = await withTenant(tenantId, async (tx) =>
      tx.execute(sql`
        UPDATE "usage_counters"
        SET "alertas_enviados" = "alertas_enviados" || ${JSON.stringify([key])}::jsonb,
            "updated_at" = now()
        WHERE "tenant_id" = ${tenantId}
          AND "periodo"   = ${periodo}
          AND NOT ("alertas_enviados" @> ${JSON.stringify([key])}::jsonb)
        RETURNING "id"
      `)
    );
    if ((inserted as unknown[]).length > 0) {
      alertsDue.push(alert);
    }
  }

  return { blocked: false, alertsDue };
}

/** Returns current billing period as 'YYYY-MM'. */
export function currentPeriod(): string {
  return new Date().toISOString().slice(0, 7);
}
