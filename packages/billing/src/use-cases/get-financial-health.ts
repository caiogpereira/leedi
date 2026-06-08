import { withServiceRole, sql } from '@leedi/db';

export interface Delinquent {
  tenantId: string;
  tenantName: string;
  plano: string;
  daysOverdue: number;
  totalOverdue: number;
}

export interface FinancialHealth {
  /** Sum of subscriptions.valor WHERE status = 'ativa' (BRL). */
  mrr: number;
  /** Sum of invoices.valor paid since the start of the current month (BRL). */
  receivedThisMonth: number;
  /** Sum of subscriptions.valor WHERE status IN ('ativa','atrasada') (BRL). */
  projectedRevenue: number;
  /** Sum of invoices.valor WHERE status IN ('pendente','atrasado') (BRL). */
  openReceivables: number;
  /** Count of subscriptions cancelled in the current month. */
  churnThisMonth: number;
  /** Tenants with at least one overdue invoice, ordered by days overdue desc. */
  delinquents: Delinquent[];
}

function toNumber(value: unknown): number {
  if (value === null || value === undefined) return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Aggregates SaaS-wide financial health for the super-admin Financeiro dashboard
 * (Story 20.1, FR123–FR127). Reads across ALL tenants via `withServiceRole`, so
 * it MUST only be reached behind the workspace-admin guard in the admin `(shell)`
 * layout — there is intentionally no tenant-facing surface for this data.
 *
 * SECURITY: highest-risk read surface, same posture as `listAllTenants`.
 *
 * Enum note: `subscriptions`/`invoices` use PT-BR status literals
 * (`ativa`/`atrasada`/`cancelada`, `pendente`/`atrasado`), distinct from the
 * English `tenants.status` — the literals below are deliberate and correct.
 *
 * Subscription and invoice aggregates run as SEPARATE queries (not a single
 * subscriptions⋈invoices join) so that a subscription with multiple invoices
 * does not fan out and double-count `subscriptions.valor`.
 */
export async function getFinancialHealth(): Promise<FinancialHealth> {
  return withServiceRole(async (tx) => {
    const subsRows = (await tx.execute(sql`
      SELECT
        SUM(valor) FILTER (WHERE status = 'ativa') AS mrr,
        SUM(valor) FILTER (WHERE status IN ('ativa', 'atrasada')) AS projected,
        COUNT(*) FILTER (
          WHERE status = 'cancelada'
            AND updated_at >= date_trunc('month', CURRENT_DATE)
        ) AS churn
      FROM subscriptions
    `)) as Array<{ mrr: unknown; projected: unknown; churn: unknown }>;

    const invoiceRows = (await tx.execute(sql`
      SELECT
        SUM(valor) FILTER (WHERE pago_em >= date_trunc('month', CURRENT_DATE)) AS received,
        SUM(valor) FILTER (WHERE status IN ('pendente', 'atrasado')) AS open_receivables
      FROM invoices
    `)) as Array<{ received: unknown; open_receivables: unknown }>;

    const delinquentRows = (await tx.execute(sql`
      SELECT
        t.id AS tenant_id,
        t.name AS tenant_name,
        t.plan AS plano,
        MAX(CURRENT_DATE - i.vencimento) AS days_overdue,
        SUM(i.valor) AS total_overdue
      FROM invoices i
      JOIN tenants t ON t.id = i.tenant_id
      WHERE i.status = 'atrasado'
      GROUP BY t.id, t.name, t.plan
      ORDER BY days_overdue DESC
    `)) as Array<{
      tenant_id: string;
      tenant_name: string;
      plano: string;
      days_overdue: unknown;
      total_overdue: unknown;
    }>;

    const subs = subsRows[0] ?? { mrr: null, projected: null, churn: null };
    const inv = invoiceRows[0] ?? { received: null, open_receivables: null };

    return {
      mrr: toNumber(subs.mrr),
      projectedRevenue: toNumber(subs.projected),
      churnThisMonth: toNumber(subs.churn),
      receivedThisMonth: toNumber(inv.received),
      openReceivables: toNumber(inv.open_receivables),
      delinquents: delinquentRows.map((row) => ({
        tenantId: row.tenant_id,
        tenantName: row.tenant_name,
        plano: row.plano,
        daysOverdue: toNumber(row.days_overdue),
        totalOverdue: toNumber(row.total_overdue),
      })),
    };
  });
}
