import { getCurrentTenantContext } from '../../../../lib/tenant-context';
import { TemplateDetailClient } from './template-detail-client';

interface TemplateDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function TemplateDetailPage({ params }: TemplateDetailPageProps) {
  const ctx = await getCurrentTenantContext();

  if (!ctx) {
    return <div className="p-8 text-muted-foreground">Nenhum workspace encontrado.</div>;
  }

  const currentTenant = ctx.tenant;

  const { id } = await params;

  return <TemplateDetailClient tenantId={currentTenant.tenantId} templateId={id} />;
}
