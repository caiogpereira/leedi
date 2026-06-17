import { getCurrentTenantContext } from '../../../../lib/tenant-context';
import { db, schema, eq } from '@leedi/db';
import { AgentConfigClient } from './agent-config-client';

export default async function ConfiguracoesPage() {
  const ctx = await getCurrentTenantContext();

  if (!ctx) {
    return <div className="p-8 text-muted-foreground">Nenhum workspace encontrado.</div>;
  }

  const currentTenant = ctx.tenant;

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
