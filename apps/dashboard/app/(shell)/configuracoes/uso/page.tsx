import { getCurrentTenantContext } from '../../../../lib/tenant-context';
import { UsageSettingsClient } from './usage-settings-client';

export default async function UsageSettingsPage() {
  const ctx = await getCurrentTenantContext();

  if (!ctx) {
    return <div className="p-8 text-muted-foreground">Nenhum workspace encontrado.</div>;
  }

  const currentTenant = ctx.tenant;

  return <UsageSettingsClient tenantId={currentTenant.tenantId} />;
}
