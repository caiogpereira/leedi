import { headers } from 'next/headers';
import { getSession } from '@leedi/auth';
import { listUserTenants } from '@leedi/tenancy';
import { db, schema, eq } from '@leedi/db';
import { AgentConfigClient } from './agent-config-client';

export default async function ConfiguracoesPage() {
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

  // Global sales methods power the "Método de venda" section.
  const methods = await db
    .select({
      id: schema.salesMethods.id,
      titulo: schema.salesMethods.titulo,
      descricao: schema.salesMethods.descricao,
    })
    .from(schema.salesMethods)
    .where(eq(schema.salesMethods.isGlobal, true));

  return (
    <AgentConfigClient tenantId={currentTenant.tenantId} salesMethods={methods} />
  );
}
