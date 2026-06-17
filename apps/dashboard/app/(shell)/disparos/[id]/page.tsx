import { getCurrentTenantContext } from '../../../../lib/tenant-context';
import { DispatchDetailClient } from './dispatch-detail-client';

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await getCurrentTenantContext();
  if (!ctx)
    return <div className="p-8 text-muted-foreground">Nenhum workspace encontrado.</div>;

  const currentTenant = ctx.tenant;

  const { id } = await params;
  return <DispatchDetailClient tenantId={currentTenant.tenantId} jobId={id} />;
}
