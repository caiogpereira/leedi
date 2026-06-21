import { requireTenantRouteAccess } from '../../../../lib/tenant-context';
import { withTenant, schema, eq } from '@leedi/db';
import { env } from '@leedi/config';
import { HottokForm } from './hottok-form';

// Source of truth: apps/api/src/utils/api-public-url.ts resolveApiPublicUrl().
// Intentionally duplicated (not imported from @leedi/config) because ~43 test files
// do `vi.mock('@leedi/config', () => ({ env }))`, which would make any non-`env`
// export resolve to `undefined` in those suites; the agent tools keep their own copy
// (packages/agent/src/tools/api-url.ts) for the same reason. Safe to duplicate here:
// this value is display-only — after the user saves, the form overwrites it with the
// API's authoritative response, so drift can at worst show a stale URL, never break a
// webhook. Keep this algorithm in sync with the API util if it ever changes.
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
