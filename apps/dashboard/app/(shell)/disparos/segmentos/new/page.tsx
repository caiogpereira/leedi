import { getCurrentTenantContext } from '../../../../../lib/tenant-context';
import { SegmentBuilderClient } from './segment-builder-client';

export default async function Page() {
  const ctx = await getCurrentTenantContext();
  if (!ctx)
    return <div className="p-8 text-muted-foreground">Nenhum workspace encontrado.</div>;

  const currentTenant = ctx.tenant;

  return <SegmentBuilderClient tenantId={currentTenant.tenantId} />;
}
