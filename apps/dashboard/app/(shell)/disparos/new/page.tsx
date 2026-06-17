import { getCurrentTenantContext } from '../../../../lib/tenant-context';
import { NewDispatchClient } from './new-dispatch-client';

export default async function Page() {
  const ctx = await getCurrentTenantContext();
  if (!ctx)
    return <div className="p-8 text-muted-foreground">Nenhum workspace encontrado.</div>;

  const currentTenant = ctx.tenant;

  return <NewDispatchClient tenantId={currentTenant.tenantId} />;
}
