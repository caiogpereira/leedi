import { requireTenantRouteAccess } from '../../../../lib/tenant-context';
import { withTenant, schema, eq } from '@leedi/db';
import { EmpresaForm } from './empresa-form';

export default async function EmpresaPage() {
  // RBAC: '/configuracoes/empresa' → owner|admin (ROUTE_PERMISSION_MAP, Task P2-1 Step 4).
  const ctx = await requireTenantRouteAccess('/configuracoes/empresa');
  const tenantId = ctx.tenant.tenantId;

  const rows = await withTenant(tenantId, async (tx) =>
    tx.select({ name: schema.tenants.name, cnpj: schema.tenants.cnpj, endereco: schema.tenants.endereco })
      .from(schema.tenants)
      .where(eq(schema.tenants.id, tenantId))
      .limit(1)
  );
  const t = rows[0];

  return (
    <EmpresaForm
      tenantId={tenantId}
      initial={{ nome: t?.name ?? '', cnpj: t?.cnpj ?? '', endereco: t?.endereco ?? '' }}
    />
  );
}
