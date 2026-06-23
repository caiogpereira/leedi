import { withServiceRole, sql } from '@leedi/db';

export interface TenantDetail {
  id: string;
  name: string;
  slug: string;
  /** English enum: 'active' | 'trial' | 'blocked' | 'cancelled' */
  status: string;
  plan: string;
  createdAt: Date;
  /** From `tenants.config->>'billing_status'` — e.g. 'pendente_configuracao' (Story 17.1 failure flag). */
  billingStatus: string | null;
  /** Monthly subscription value (BRL) of the latest non-cancelled subscription, or null. */
  subscriptionValor: number | null;
  /** Overage value billed for the PREVIOUS month (BRL) — AC#1 "overage last month". */
  overageValor: number;
  /** Accumulated Anthropic AI cost for the CURRENT month (USD), 0 when none. */
  custoIaUsd: number;
  /** Most recent invoice payment timestamp, or null if never paid. */
  lastPayment: Date | null;
}

function toNumber(value: unknown): number {
  if (value === null || value === undefined) return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function toNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function toNullableDate(value: unknown): Date | null {
  if (value === null || value === undefined) return null;
  const d = new Date(value as string);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Lists ALL tenants with the lifecycle/financial columns the super-admin Clientes
 * page needs (Story 20.2, FR128–FR138): subscription value, previous-month overage
 * (AC#1 "overage last month"), last payment date and the `billing_status` config flag.
 *
 * SECURITY: reads across every tenant via `withServiceRole` (RLS bypass), exactly
 * like `listAllTenants` / `getFinancialHealth`. ONLY reachable behind the
 * workspace-admin guard in the admin `(shell)/layout.tsx`. Never expose on a
 * tenant-facing route.
 *
 * Enum note: `subscriptions.status` uses PT-BR literals (`cancelada`), distinct
 * from the English `tenants.status` — both are deliberate and correct.
 *
 * LATERAL joins (instead of the story's GROUP BY) avoid a fan-out double-count
 * when a tenant has more than one subscription or invoice row.
 */
export async function listAllTenantsDetailed(): Promise<TenantDetail[]> {
  return withServiceRole(async (tx) => {
    const rows = (await tx.execute(sql`
      SELECT
        t.id,
        t.name,
        t.slug,
        t.status,
        t.plan,
        t.created_at,
        t.config->>'billing_status' AS billing_status,
        s.valor AS subscription_valor,
        uc_prev.overage_valor,
        uc_cur.custo_ia_usd,
        lp.ultimo_pagamento
      FROM tenants t
      LEFT JOIN LATERAL (
        SELECT valor
        FROM subscriptions
        WHERE tenant_id = t.id AND status != 'cancelada'
        ORDER BY created_at DESC
        LIMIT 1
      ) s ON true
      LEFT JOIN usage_counters uc_prev
        ON uc_prev.tenant_id = t.id
        AND uc_prev.periodo = TO_CHAR(CURRENT_DATE - INTERVAL '1 month', 'YYYY-MM')
      LEFT JOIN usage_counters uc_cur
        ON uc_cur.tenant_id = t.id
        AND uc_cur.periodo = TO_CHAR(CURRENT_DATE, 'YYYY-MM')
      LEFT JOIN LATERAL (
        SELECT MAX(pago_em) AS ultimo_pagamento
        FROM invoices
        WHERE tenant_id = t.id
      ) lp ON true
      ORDER BY t.created_at DESC
    `)) as Array<{
      id: string;
      name: string;
      slug: string;
      status: string;
      plan: string;
      created_at: unknown;
      billing_status: string | null;
      subscription_valor: unknown;
      overage_valor: unknown;
      custo_ia_usd: unknown;
      ultimo_pagamento: unknown;
    }>;

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      slug: row.slug,
      status: row.status,
      plan: row.plan,
      createdAt: new Date(row.created_at as string),
      billingStatus: row.billing_status ?? null,
      subscriptionValor: toNullableNumber(row.subscription_valor),
      overageValor: toNumber(row.overage_valor),
      custoIaUsd: toNumber(row.custo_ia_usd),
      lastPayment: toNullableDate(row.ultimo_pagamento),
    }));
  });
}
