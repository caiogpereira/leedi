import { getTranslations } from "next-intl/server";
import { CheckCircle2 } from "lucide-react";
import { getFinancialHealth } from "@leedi/billing";

// Always render on request so a refresh reflects the latest payments/cancellations
// (AC#3: after an Asaas webhook is processed, refreshing must show updated metrics
// and drop the paid tenant from the delinquency list). The parent (shell) layout
// already forces dynamic rendering via `headers()`; this makes the intent explicit
// and prevents any build-time prerender from opening a DB connection.
export const dynamic = "force-dynamic";

function formatBRL(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/**
 * Super-admin Financeiro dashboard (Story 20.1, FR123–FR127).
 *
 * Auth: the workspace-admin guard lives in `(shell)/layout.tsx`
 * (getWorkspaceAdminRole === 'super_admin'); non-admins never reach this page,
 * which is how AC#5's "no unauthorized access to financial data" is satisfied
 * (server-component path — there is no public /api/admin/financial-health route).
 */
export default async function FinanceiroPage() {
  const t = await getTranslations("financeiro");
  const data = await getFinancialHealth();

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label={t("kpi.mrr")} value={formatBRL(data.mrr)} hint={t("kpi.mrrHint")} />
        <KpiCard
          label={t("kpi.received")}
          value={formatBRL(data.receivedThisMonth)}
          hint={t("kpi.receivedHint", { projected: formatBRL(data.projectedRevenue) })}
        />
        <KpiCard
          label={t("kpi.openReceivables")}
          value={formatBRL(data.openReceivables)}
          hint={t("kpi.openReceivablesHint")}
          emphasis={data.openReceivables > 0 ? "danger" : "default"}
        />
        <KpiCard
          label={t("kpi.churn")}
          value={String(data.churnThisMonth)}
          hint={t("kpi.churnHint")}
        />
      </div>

      {/* Delinquency table */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">{t("delinquency.title")}</h2>

        {data.delinquents.length === 0 ? (
          <div className="flex items-center gap-2 rounded-md border border-dashed p-6 text-sm text-muted-foreground">
            <CheckCircle2 className="h-5 w-5 text-emerald-600" aria-hidden="true" />
            {t("delinquency.empty")}
          </div>
        ) : (
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="py-2 pr-4 font-medium">{t("delinquency.columns.tenant")}</th>
                <th className="py-2 pr-4 font-medium">{t("delinquency.columns.plan")}</th>
                <th className="py-2 pr-4 font-medium">
                  {t("delinquency.columns.daysOverdue")}
                </th>
                <th className="py-2 pr-4 text-right font-medium">
                  {t("delinquency.columns.totalOverdue")}
                </th>
              </tr>
            </thead>
            <tbody>
              {data.delinquents.map((d) => (
                <tr key={d.tenantId} className="border-b">
                  <td className="py-3 pr-4 font-medium">{d.tenantName}</td>
                  <td className="py-3 pr-4 capitalize text-muted-foreground">{d.plano}</td>
                  <td className="py-3 pr-4 text-muted-foreground">{d.daysOverdue}</td>
                  <td className="py-3 pr-4 text-right font-medium text-destructive">
                    {formatBRL(d.totalOverdue)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

function KpiCard({
  label,
  value,
  hint,
  emphasis = "default",
}: {
  label: string;
  value: string;
  hint?: string;
  emphasis?: "default" | "danger";
}) {
  return (
    <div className="rounded-lg border bg-card p-4 shadow-sm">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p
        className={
          emphasis === "danger"
            ? "mt-1 text-2xl font-bold text-destructive"
            : "mt-1 text-2xl font-bold"
        }
      >
        {value}
      </p>
      {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
