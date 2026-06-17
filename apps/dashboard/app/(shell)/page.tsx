import { getCurrentTenantContext } from '../../lib/tenant-context';
import { DashboardClient } from './components/dashboard-client';

export default async function DashboardPage() {
  const ctx = await getCurrentTenantContext();

  if (!ctx) {
    return <div className="p-8 text-muted-foreground">Nenhum workspace encontrado.</div>;
  }

  const currentTenant = ctx.tenant;

  return <DashboardClient tenantId={currentTenant.tenantId} />;
}
