import { getCurrentTenantContext } from '../../../../lib/tenant-context';
import { ConversaDetailClient } from './components/conversa-detail-client';

interface Props {
  params: Promise<{ windowId: string }>;
}

export default async function ConversaDetailPage({ params }: Props) {
  const { windowId } = await params;
  const ctx = await getCurrentTenantContext();

  if (!ctx) {
    return <div className="p-8 text-muted-foreground">Nenhum workspace encontrado.</div>;
  }

  const currentTenant = ctx.tenant;

  return (
    <ConversaDetailClient
      tenantId={currentTenant.tenantId}
      windowId={windowId}
      currentUserId={ctx.userId}
    />
  );
}
