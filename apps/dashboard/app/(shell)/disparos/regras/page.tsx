import { getCurrentTenantContext } from '../../../../lib/tenant-context';
import { RulesListClient } from './rules-list-client';

export default async function Page() {
  const ctx = await getCurrentTenantContext();
  if (!ctx)
    return <div className="p-8 text-muted-foreground">Nenhum workspace encontrado.</div>;

  const currentTenant = ctx.tenant;

  return <RulesListClient tenantId={currentTenant.tenantId} />;
}
