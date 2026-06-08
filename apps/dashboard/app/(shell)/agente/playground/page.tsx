import { headers } from 'next/headers';
import { getSession } from '@leedi/auth';
import { listUserTenants } from '@leedi/tenancy';
import { PlaygroundClient } from './playground-client';

export default async function PlaygroundPage() {
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

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Playground</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Teste seu agente em modo sandbox — nenhuma mensagem real é enviada.
        </p>
      </div>
      <PlaygroundClient tenantId={currentTenant.tenantId} />
    </div>
  );
}
