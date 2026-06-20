import { getCurrentTenantContext } from '../../../lib/tenant-context';
import { listProducts } from '@leedi/knowledge';
import { CampaignListClient } from './campaign-list-client';

export default async function CampanhasPage() {
  const ctx = await getCurrentTenantContext();

  if (!ctx) {
    return <div className="p-8 text-muted-foreground">Nenhum workspace encontrado.</div>;
  }

  const currentTenant = ctx.tenant;
  const products = await listProducts({ tenantId: currentTenant.tenantId, archived: false });

  return (
    <CampaignListClient
      tenantId={currentTenant.tenantId}
      products={products.map((p) => ({ id: p.id, nome: p.nome }))}
    />
  );
}
