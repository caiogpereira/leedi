import { getCurrentTenantContext } from '../../../../lib/tenant-context';
import { SegmentListClient } from './segment-list-client';

export default async function Page() {
  const ctx = await getCurrentTenantContext();
  if (!ctx)
    return <div className="p-8 text-muted-foreground">Nenhum workspace encontrado.</div>;

  const currentTenant = ctx.tenant;

  return <SegmentListClient tenantId={currentTenant.tenantId} />;
}
