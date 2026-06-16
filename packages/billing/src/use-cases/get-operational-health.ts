import { withServiceRole, sql } from '@leedi/db';

/** Business rule: a tenant within 20% of its conversation limit is an upsell lead. */
export const NEAR_LIMIT_THRESHOLD = 0.8;

export interface NearLimitTenant {
  tenantId: string;
  tenantName: string;
  plano: string;
  conversasUsadas: number;
  conversasLimite: number;
  /** conversas_usadas / conversas_limite * 100, rounded to 1 decimal. */
  usagePct: number;
  /** Owner email for the "Entrar em contato" CTA (copy-to-clipboard in V1). */
  ownerEmail: string | null;
}

export interface QualityRiskTenant {
  tenantId: string;
  tenantName: string;
  /** PT-BR enum: 'amarelo' | 'vermelho' (green/'verde' is never at risk). */
  qualityRating: string;
  /**
   * Approx. whole days at the current (yellow/red) rating. Derived from
   * `whatsapp_connections.updated_at` (no rating-transition timestamp exists yet);
   * see the query comment. Exact value is deferred follow-up work.
   */
  daysAtRisk: number;
}

export interface OperationalHealth {
  /** Total conversations across ALL tenants in the current month. */
  totalConversas: number;
  /** Aggregate Anthropic spend across all tenants this month, in USD. */
  totalAiCostUsd: number;
  /** (MRR_BRL - AI_cost_BRL) / MRR_BRL * 100, or 0 when MRR is 0. */
  marginPct: number;
  /** The fixed USD→BRL rate used for the margin estimate (shown in the UI note). */
  usdToBrlRate: number;
  /** Tenants created since the start of the current month. */
  newTenantsThisMonth: number;
  /** Subscriptions cancelled in the current month. */
  churnThisMonth: number;
  /** newTenantsThisMonth - churnThisMonth (can be negative). */
  netGrowth: number;
  nearLimitTenants: NearLimitTenant[];
  qualityRiskTenants: QualityRiskTenant[];
}

function toNumber(value: unknown): number {
  if (value === null || value === undefined) return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Estimated gross margin as a percentage. Pure + exported for unit testing.
 * Returns 0 when MRR is 0 (avoids divide-by-zero / NaN on a fresh workspace).
 */
export function computeMarginPct(mrrBrl: number, aiCostUsd: number, usdToBrlRate: number): number {
  if (mrrBrl <= 0) return 0;
  const aiCostBrl = aiCostUsd * usdToBrlRate;
  return ((mrrBrl - aiCostBrl) / mrrBrl) * 100;
}

/**
 * Aggregates SaaS-wide operational health + risk signals for the super-admin
 * Operacional dashboard (Story 20.3, FR130–FR133). Reads across ALL tenants via
 * `withServiceRole`, so it MUST only be reached behind the workspace-admin guard
 * in the admin `(shell)/layout.tsx` — there is no tenant-facing surface for this
 * data (per FR108, `custo_ia_usd` is super-admin only).
 *
 * `usdToBrlRate` is injected by the caller from `env.USD_TO_BRL_RATE` so the
 * use-case stays pure (no env coupling) and easily testable.
 *
 * Enum traps (verified against the real schema, NOT the story text):
 * - the table is `whatsapp_connections` (not `connections`)
 * - `quality_rating` is PT-BR: `verde`/`amarelo`/`vermelho` (risk = amarelo/vermelho)
 * - `subscriptions.status` is PT-BR (`ativa`/`cancelada`)
 *
 * Aggregates run as SEPARATE queries (usage / tenants / subscriptions) so a
 * tenant with multiple subscriptions or counters can't fan out and double-count.
 */
export async function getOperationalHealth(usdToBrlRate: number): Promise<OperationalHealth> {
  return withServiceRole(async (tx) => {
    const usageRows = (await tx.execute(sql`
      SELECT
        SUM(conversas_usadas) AS total_conversas,
        SUM(custo_ia_usd) AS total_ai_cost_usd
      FROM usage_counters
      WHERE periodo = TO_CHAR(CURRENT_DATE, 'YYYY-MM')
    `)) as Array<{ total_conversas: unknown; total_ai_cost_usd: unknown }>;

    const tenantRows = (await tx.execute(sql`
      SELECT COUNT(*) FILTER (
        WHERE created_at >= date_trunc('month', CURRENT_DATE)
      ) AS new_tenants
      FROM tenants
    `)) as Array<{ new_tenants: unknown }>;

    const subsRows = (await tx.execute(sql`
      SELECT
        SUM(valor) FILTER (WHERE status = 'ativa') AS mrr,
        COUNT(DISTINCT tenant_id) FILTER (
          WHERE status = 'cancelada'
            AND updated_at >= date_trunc('month', CURRENT_DATE)
        ) AS churn
      FROM subscriptions
    `)) as Array<{ mrr: unknown; churn: unknown }>;

    const nearLimitRows = (await tx.execute(sql`
      SELECT
        t.id AS tenant_id,
        t.name AS tenant_name,
        t.plan AS plano,
        uc.conversas_usadas,
        uc.conversas_limite,
        ROUND(uc.conversas_usadas::numeric / NULLIF(uc.conversas_limite, 0) * 100, 1) AS usage_pct,
        owner.email AS owner_email
      FROM usage_counters uc
      JOIN tenants t ON t.id = uc.tenant_id
      LEFT JOIN LATERAL (
        SELECT u.email
        FROM memberships m
        JOIN users u ON u.id = m.user_id
        WHERE m.tenant_id = t.id AND m.role = 'owner'
        ORDER BY m.created_at ASC
        LIMIT 1
      ) owner ON true
      WHERE uc.periodo = TO_CHAR(CURRENT_DATE, 'YYYY-MM')
        AND uc.conversas_limite > 0
        AND uc.conversas_usadas >= uc.conversas_limite::numeric * ${NEAR_LIMIT_THRESHOLD}
      ORDER BY usage_pct DESC
    `)) as Array<{
      tenant_id: string;
      tenant_name: string;
      plano: string;
      conversas_usadas: unknown;
      conversas_limite: unknown;
      usage_pct: unknown;
      owner_email: string | null;
    }>;

    const qualityRows = (await tx.execute(sql`
      SELECT
        t.id AS tenant_id,
        t.name AS tenant_name,
        c.quality_rating,
        -- APPROXIMATION (AC#4): there is no dedicated rating-transition timestamp on
        -- whatsapp_connections, and the health-check write path does not bump
        -- updated_at per rating change, so this is days-since-last-row-write: a
        -- usable proxy, not the exact consecutive-days-at-rating. A precise value
        -- needs a quality_rating_changed_at column (deferred follow-up).
        CURRENT_DATE - DATE(c.updated_at) AS days_at_risk
      FROM whatsapp_connections c
      JOIN tenants t ON t.id = c.tenant_id
      WHERE c.quality_rating IN ('amarelo', 'vermelho')
        AND c.status = 'conectado'
      ORDER BY c.quality_rating DESC, c.updated_at ASC
    `)) as Array<{
      tenant_id: string;
      tenant_name: string;
      quality_rating: string;
      days_at_risk: unknown;
    }>;

    const totalConversas = toNumber(usageRows[0]?.total_conversas);
    const totalAiCostUsd = toNumber(usageRows[0]?.total_ai_cost_usd);
    const newTenantsThisMonth = toNumber(tenantRows[0]?.new_tenants);
    const mrr = toNumber(subsRows[0]?.mrr);
    const churnThisMonth = toNumber(subsRows[0]?.churn);

    return {
      totalConversas,
      totalAiCostUsd,
      marginPct: computeMarginPct(mrr, totalAiCostUsd, usdToBrlRate),
      usdToBrlRate,
      newTenantsThisMonth,
      churnThisMonth,
      netGrowth: newTenantsThisMonth - churnThisMonth,
      nearLimitTenants: nearLimitRows.map((row) => ({
        tenantId: row.tenant_id,
        tenantName: row.tenant_name,
        plano: row.plano,
        conversasUsadas: toNumber(row.conversas_usadas),
        conversasLimite: toNumber(row.conversas_limite),
        usagePct: toNumber(row.usage_pct),
        ownerEmail: row.owner_email ?? null,
      })),
      qualityRiskTenants: qualityRows.map((row) => ({
        tenantId: row.tenant_id,
        tenantName: row.tenant_name,
        qualityRating: row.quality_rating,
        daysAtRisk: toNumber(row.days_at_risk),
      })),
    };
  });
}
