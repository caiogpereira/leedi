import { getCurrentTenantContext } from '../../../../../lib/tenant-context';
import { NewRuleClient } from './new-rule-client';

export default async function Page() {
  const ctx = await getCurrentTenantContext();
  if (!ctx)
    return <div className="p-8 text-muted-foreground">Nenhum workspace encontrado.</div>;

  const currentTenant = ctx.tenant;

  return <NewRuleClient tenantId={currentTenant.tenantId} />;
}
