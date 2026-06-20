import { requireTenantRouteAccess } from '../../../../lib/tenant-context';
import { withTenant, schema, eq } from '@leedi/db';
import { env } from '@leedi/config';
import { HottokForm } from './hottok-form';

// Mirrors apps/api/src/utils/api-public-url.ts resolveApiPublicUrl() — the dashboard
// renders this for display only (the API is the source of truth that validates webhooks).
function resolveApiPublicUrl(): string {
  if (env.API_PUBLIC_URL) return env.API_PUBLIC_URL.replace(/\/+$/, '');
  return env.BETTER_AUTH_URL.replace(':3000', `:${env.API_PORT}`);
}

export default async function GatewayPage() {
  // RBAC: '/configuracoes/gateway' → owner only (ROUTE_PERMISSION_MAP, Task P2-1 Step 4).
  const ctx = await requireTenantRouteAccess('/configuracoes/gateway');
  const tenantId = ctx.tenant.tenantId;

  const rows = await withTenant(tenantId, async (tx) =>
    tx
      .select({
        webhookUrlPath: schema.gatewayIntegrations.webhookUrlPath,
        webhookSecret: schema.gatewayIntegrations.webhookSecret,
      })
      .from(schema.gatewayIntegrations)
      .where(eq(schema.gatewayIntegrations.tenantId, tenantId))
      .limit(1)
  );
  const r = rows[0];
  const hottokSet = !!r?.webhookSecret;
  const webhookUrl = r?.webhookUrlPath ? `${resolveApiPublicUrl()}/webhooks/hotmart/${r.webhookUrlPath}` : null;

  return <HottokForm tenantId={tenantId} initial={{ hottokSet, webhookUrl }} />;
}
