import { getCurrentTenantContext } from '../../../../lib/tenant-context';
import { listProducts } from '@leedi/knowledge';
import { CampaignDetailClient } from './campaign-detail-client';

export default async function CampaignDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await getCurrentTenantContext();

  if (!ctx) {
    return <div className="p-8 text-muted-foreground">Nenhum workspace encontrado.</div>;
  }

  const currentTenant = ctx.tenant;
  const products = await listProducts({ tenantId: currentTenant.tenantId, archived: false });

  return (
    <CampaignDetailClient
      tenantId={currentTenant.tenantId}
      campaignId={id}
      products={products
        .map((p) => ({ id: p.id, nome: p.nome }))
        .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))}
    />
  );
}
