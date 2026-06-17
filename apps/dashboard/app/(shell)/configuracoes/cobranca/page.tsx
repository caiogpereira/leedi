import { getCurrentTenantContext } from '../../../../lib/tenant-context';
import { BillingClient } from './billing-client';

export default async function BillingPage() {
  const ctx = await getCurrentTenantContext();

  if (!ctx) {
    return <div className="p-8 text-muted-foreground">Nenhum workspace encontrado.</div>;
  }

  const currentTenant = ctx.tenant;

  return <BillingClient tenantId={currentTenant.tenantId} />;
}
