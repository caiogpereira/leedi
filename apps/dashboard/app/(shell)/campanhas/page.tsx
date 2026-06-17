import { getCurrentTenantContext } from '../../../lib/tenant-context';
import { CampaignListClient } from './campaign-list-client';

export default async function CampanhasPage() {
  const ctx = await getCurrentTenantContext();

  if (!ctx) {
    return <div className="p-8 text-muted-foreground">Nenhum workspace encontrado.</div>;
  }

  const currentTenant = ctx.tenant;

  return <CampaignListClient tenantId={currentTenant.tenantId} />;
}
