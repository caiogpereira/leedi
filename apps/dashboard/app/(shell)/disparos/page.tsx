import { getCurrentTenantContext } from '../../../lib/tenant-context';
import { DispatchListClient } from './dispatch-list-client';

export default async function Page() {
  const ctx = await getCurrentTenantContext();
  if (!ctx)
    return <div className="p-8 text-muted-foreground">Nenhum workspace encontrado.</div>;

  const currentTenant = ctx.tenant;

  return <DispatchListClient tenantId={currentTenant.tenantId} />;
}
