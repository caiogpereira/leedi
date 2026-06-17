import { getCurrentTenantContext } from '../../../../lib/tenant-context';
import { TemplateBibliotecaClient } from './template-biblioteca-client';

export default async function TemplateBibliotecaPage() {
  const ctx = await getCurrentTenantContext();

  if (!ctx) {
    return <div className="p-8 text-muted-foreground">Nenhum workspace encontrado.</div>;
  }

  const currentTenant = ctx.tenant;

  return <TemplateBibliotecaClient tenantId={currentTenant.tenantId} />;
}
