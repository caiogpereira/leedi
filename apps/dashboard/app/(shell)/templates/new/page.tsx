import { getCurrentTenantContext } from '../../../../lib/tenant-context';
import { TemplateBuilderClient } from '../template-builder-client';

interface NewTemplatePageProps {
  searchParams: Promise<{ library?: string }>;
}

export default async function NewTemplatePage({ searchParams }: NewTemplatePageProps) {
  const ctx = await getCurrentTenantContext();

  if (!ctx) {
    return <div className="p-8 text-muted-foreground">Nenhum workspace encontrado.</div>;
  }

  const currentTenant = ctx.tenant;

  const params = await searchParams;

  return (
    <TemplateBuilderClient
      tenantId={currentTenant.tenantId}
      libraryId={params.library}
    />
  );
}
