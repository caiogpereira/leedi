import { getCurrentTenantContext } from '../../../../lib/tenant-context';
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

  return <CampaignDetailClient tenantId={currentTenant.tenantId} campaignId={id} />;
}
