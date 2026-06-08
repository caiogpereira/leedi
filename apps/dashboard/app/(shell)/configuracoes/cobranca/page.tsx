import { headers } from 'next/headers';
import { getSession } from '@leedi/auth';
import { listUserTenants } from '@leedi/tenancy';
import { BillingClient } from './billing-client';

export default async function BillingPage() {
  const requestHeaders = await headers();
  const session = await getSession(requestHeaders);

  if (!session) {
    return <div className="p-8 text-muted-foreground">Sessão expirada.</div>;
  }

  const tenants = await listUserTenants(session.user.id);
  const headerTenantId = requestHeaders.get('x-leedi-tenant-id');
  const currentTenant = tenants.find((t) => t.tenantId === headerTenantId) ?? tenants[0];

  if (!currentTenant) {
    return <div className="p-8 text-muted-foreground">Nenhum workspace encontrado.</div>;
  }

  return <BillingClient tenantId={currentTenant.tenantId} />;
}
