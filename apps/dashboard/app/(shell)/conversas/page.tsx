import { getCurrentTenantContext } from '../../../lib/tenant-context';
import { ConversasClient } from './components/conversas-client';

export default async function ConversasPage() {
  const ctx = await getCurrentTenantContext();

  if (!ctx) {
    return <div className="p-8 text-muted-foreground">Nenhum workspace encontrado.</div>;
  }

  const currentTenant = ctx.tenant;

  return <ConversasClient tenantId={currentTenant.tenantId} />;
}
