import { getCurrentTenantContext } from '../../../lib/tenant-context';
import { UsageHistoryClient } from './usage-history-client';

export default async function UsagePage() {
  const ctx = await getCurrentTenantContext();

  if (!ctx) {
    return <div className="p-8 text-muted-foreground">Nenhum workspace encontrado.</div>;
  }

  const currentTenant = ctx.tenant;

  return <UsageHistoryClient tenantId={currentTenant.tenantId} />;
}
