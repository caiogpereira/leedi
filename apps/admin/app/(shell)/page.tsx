import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { getFinancialHealth, getOperationalHealth } from "@leedi/billing";
import { listAllTenantsDetailed } from "@leedi/tenancy";
import { env } from "@leedi/config";
import { Card } from "@leedi/ui";

// Render on request so a refresh reflects the latest tenants/payments/risk signals
// (same posture as the Financeiro/Operacional dashboards this aggregates).
export const dynamic = "force-dynamic";

function formatBRL(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/**
 * Super-admin "Visão Geral" — a headline overview that aggregates the existing
 * Story 20.1/20.2/20.3 use-cases (financial, operational, tenant list) into top
 * KPIs plus actionable "points of attention" cards that deep-link to the detail
 * dashboards. Auth is enforced by the workspace-admin guard in `(shell)/layout.tsx`.
 */
export default async function AdminHome() {
  const t = await getTranslations("visaoGeral");
  const [tenants, financial, operational] = await Promise.all([
    listAllTenantsDetailed(),
    getFinancialHealth(),
    getOperationalHealth(env.USD_TO_BRL_RATE),
  ]);

  const active = tenants.filter((row) => row.status === "active").length;
  const trial = tenants.filter((row) => row.status === "trial").length;
  const blocked = tenants.filter((row) => row.status === "blocked").length;

  const alerts = [
    {
      key: "delinquency",
      count: financial.delinquents.length,
      label: t("alerts.delinquency"),
      hint: t("alerts.delinquencyHint"),
      href: "/financeiro",
    },
    {
      key: "upsell",
      count: operational.nearLimitTenants.length,
      label: t("alerts.upsell"),
      hint: t("alerts.upsellHint"),
      href: "/operacional",
    },
    {
      key: "churnRisk",
      count: operational.qualityRiskTenants.length,
      label: t("alerts.churnRisk"),
      hint: t("alerts.churnRiskHint"),
      href: "/operacional",
    },
  ].filter((a) => a.count > 0);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label={t("kpi.activeClients")}
          value={String(active)}
          hint={t("kpi.activeClientsHint", { trial, blocked })}
        />
        <KpiCard label={t("kpi.mrr")} value={formatBRL(financial.mrr)} hint={t("kpi.mrrHint")} />
        <KpiCard
          label={t("kpi.margin")}
          value={`${operational.marginPct.toFixed(1)}%`}
          hint={t("kpi.marginHint")}
        />
        <KpiCard label={t("kpi.newTenants")} value={String(operational.newTenantsThisMonth)} />
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">{t("alerts.title")}</h2>
        {alerts.length === 0 ? (
          <div className="rounded-md border border-dashed p-6 text-sm text-muted-foreground">
            {t("alerts.allClear")}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {alerts.map((a) => (
              <Link key={a.key} href={a.href} className="block">
                <Card variant="metric" className="p-5 transition-colors hover:bg-accent">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {a.label}
                  </p>
                  <p className="mt-2 text-3xl font-bold tracking-tight text-destructive">
                    {a.count}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">{a.hint} →</p>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function KpiCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card variant="metric" className="p-5">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-2 text-3xl font-bold tracking-tight">{value}</p>
      {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
    </Card>
  );
}
