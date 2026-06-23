import { notFound } from 'next/navigation';
import { getTenantFullDetail, getTenantInvoices } from '@leedi/tenancy';
import { computeMarginPct } from '@leedi/billing';
import { env } from '@leedi/config';
import { ClienteDetalheClient } from './cliente-detalhe-client';

// Render on request so a refresh reflects the latest billing/usage state after an
// action (retry billing, change plan) or an Asaas webhook.
export const dynamic = 'force-dynamic';

/**
 * Super-admin client-detail page: identity, plan & billing, current-month
 * usage/cost/margin, connection health and invoices for a single tenant.
 *
 * Auth: behind the workspace-admin guard in `(shell)/layout.tsx`. The data
 * fetches (`getTenantFullDetail`, `getTenantInvoices`) bypass RLS; the server
 * actions backing this page re-verify super_admin independently.
 */
export default async function ClienteDetalhePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const detail = await getTenantFullDetail(id);
  if (!detail) notFound();

  const invoices = await getTenantInvoices(id);

  const rate = env.USD_TO_BRL_RATE;
  const valor = detail.subscription?.valor ?? null;
  const custoIaUsd = detail.usage?.custoIaUsd ?? 0;
  // Same margin formula + rate as the Operacional aggregate (computeMarginPct).
  // Null when there is no active subscription value — "—" instead of a fake 0%.
  const marginPct = valor && valor > 0 ? computeMarginPct(valor, custoIaUsd, rate) : null;

  return (
    <ClienteDetalheClient
      detail={detail}
      invoices={invoices}
      usdToBrlRate={rate}
      marginPct={marginPct}
      dashboardUrl={env.DASHBOARD_URL}
    />
  );
}
