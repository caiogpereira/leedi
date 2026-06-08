import { getTranslations } from 'next-intl/server';
import { getOperationalHealth } from '@leedi/billing';
import { env } from '@leedi/config';
import { ContactButton } from './ContactButton';
import { AutoRefresh } from './AutoRefresh';
import { marginEmphasis, netGrowthDisplay } from './presentation';

// Render on request so each (auto-)refresh reflects the latest aggregates and risk
// signals (AC#5: a tenant dropping to red shows up within 5 min). The (shell)
// layout already forces dynamic via headers(); this is explicit + avoids a
// build-time DB call.
export const dynamic = 'force-dynamic';

function formatUSD(value: number): string {
  return value.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

function formatBRL(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

const EMPHASIS_CLASS: Record<string, string> = {
  good: 'text-emerald-600',
  warn: 'text-amber-600',
  danger: 'text-destructive',
  default: '',
};

const QUALITY_BADGE: Record<string, string> = {
  amarelo: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
  vermelho: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300',
};

function usageBarColor(pct: number): string {
  if (pct > 90) return 'bg-destructive';
  if (pct > 70) return 'bg-amber-500';
  return 'bg-emerald-500';
}

/**
 * Super-admin Operacional dashboard (Story 20.3, FR130–FR133).
 *
 * Auth: the workspace-admin guard lives in `(shell)/layout.tsx`
 * (getWorkspaceAdminRole === 'super_admin'); non-admins never reach this page,
 * which is how AC#6's "no unauthorized access to operational data" is satisfied
 * (server-component path — there is no public /api/admin/operational-health route).
 */
export default async function OperacionalPage() {
  const t = await getTranslations('operacional');
  const data = await getOperationalHealth(env.USD_TO_BRL_RATE);

  const netGrowth = netGrowthDisplay(data.netGrowth);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <AutoRefresh />

      <div>
        <h1 className="text-2xl font-bold">{t('title')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('subtitle')}</p>
      </div>

      {/* KPI grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <KpiCard label={t('kpi.conversations')} value={data.totalConversas.toLocaleString('pt-BR')} />
        <KpiCard
          label={t('kpi.aiCost')}
          value={formatUSD(data.totalAiCostUsd)}
          hint={t('kpi.aiCostHint', {
            brl: formatBRL(data.totalAiCostUsd * data.usdToBrlRate),
            rate: data.usdToBrlRate.toLocaleString('pt-BR'),
          })}
        />
        <KpiCard
          label={t('kpi.margin')}
          value={`${data.marginPct.toFixed(1)}%`}
          hint={t('kpi.marginHint', { rate: data.usdToBrlRate.toLocaleString('pt-BR') })}
          emphasis={marginEmphasis(data.marginPct)}
        />
        <KpiCard label={t('kpi.newTenants')} value={String(data.newTenantsThisMonth)} />
        <KpiCard
          label={t('kpi.netGrowth')}
          value={netGrowth.text}
          hint={t('kpi.netGrowthHint', {
            new: data.newTenantsThisMonth,
            churn: data.churnThisMonth,
          })}
          emphasis={netGrowth.emphasis}
        />
      </div>

      {/* Upsell opportunities */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">{t('upsell.title')}</h2>
        {data.nearLimitTenants.length === 0 ? (
          <EmptyState label={t('emptySection')} />
        ) : (
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="py-2 pr-4 font-medium">{t('upsell.columns.tenant')}</th>
                <th className="py-2 pr-4 font-medium">{t('upsell.columns.plan')}</th>
                <th className="py-2 pr-4 font-medium">{t('upsell.columns.usage')}</th>
                <th className="py-2 pr-4 font-medium">{t('upsell.columns.action')}</th>
              </tr>
            </thead>
            <tbody>
              {data.nearLimitTenants.map((tenant) => (
                <tr key={tenant.tenantId} className="border-b">
                  <td className="py-3 pr-4 font-medium">{tenant.tenantName}</td>
                  <td className="py-3 pr-4 capitalize text-muted-foreground">{tenant.plano}</td>
                  <td className="py-3 pr-4">
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-28 overflow-hidden rounded-full bg-muted">
                        <div
                          className={`h-full ${usageBarColor(tenant.usagePct)}`}
                          style={{ width: `${Math.min(tenant.usagePct, 100)}%` }}
                        />
                      </div>
                      <span className="tabular-nums text-muted-foreground">
                        {tenant.usagePct.toFixed(1)}%
                      </span>
                    </div>
                  </td>
                  <td className="py-3 pr-4">
                    <ContactButton ownerEmail={tenant.ownerEmail} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* Churn risk */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">{t('churn.title')}</h2>
        {data.qualityRiskTenants.length === 0 ? (
          <EmptyState label={t('emptySection')} />
        ) : (
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="py-2 pr-4 font-medium">{t('churn.columns.tenant')}</th>
                <th className="py-2 pr-4 font-medium">{t('churn.columns.quality')}</th>
                <th className="py-2 pr-4 font-medium">{t('churn.columns.daysAtRisk')}</th>
              </tr>
            </thead>
            <tbody>
              {data.qualityRiskTenants.map((tenant) => (
                <tr
                  key={tenant.tenantId}
                  className={
                    tenant.qualityRating === 'vermelho'
                      ? 'border-b bg-red-50/50 dark:bg-red-950/20'
                      : 'border-b bg-amber-50/50 dark:bg-amber-950/20'
                  }
                >
                  <td className="py-3 pr-4 font-medium">{tenant.tenantName}</td>
                  <td className="py-3 pr-4">
                    <span
                      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                        QUALITY_BADGE[tenant.qualityRating] ?? 'bg-muted text-muted-foreground'
                      }`}
                    >
                      {t(`quality.${tenant.qualityRating}` as Parameters<typeof t>[0])}
                    </span>
                  </td>
                  <td className="py-3 pr-4 text-muted-foreground">{tenant.daysAtRisk}</td>
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
  emphasis = 'default',
}: {
  label: string;
  value: string;
  hint?: string;
  emphasis?: 'default' | 'good' | 'warn' | 'danger';
}) {
  return (
    <div className="rounded-lg border bg-card p-4 shadow-sm">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${EMPHASIS_CLASS[emphasis] ?? ''}`}>{value}</p>
      {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="rounded-md border border-dashed p-6 text-sm text-muted-foreground">{label}</div>
  );
}
