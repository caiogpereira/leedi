import { getCurrentTenantContext } from '../../../lib/tenant-context';
import { TemplateListClient } from './template-list-client';

export default async function TemplatesPage() {
  const ctx = await getCurrentTenantContext();

  if (!ctx) {
    return <div className="p-8 text-muted-foreground">Nenhum workspace encontrado.</div>;
  }

  const currentTenant = ctx.tenant;

  return <TemplateListClient tenantId={currentTenant.tenantId} />;
}
