import { withServiceRole, schema, eq } from '@leedi/db';

export interface TenantBasic {
  id: string;
  name: string;
  slug: string;
}

/**
 * Fetches a single tenant by id via the service-role path (bypasses tenant RLS).
 *
 * Used during impersonation (Story 2.8): the super-admin is NOT a member of the
 * impersonated tenant, so the normal membership-scoped reads cannot resolve its
 * name. Returns `null` when the tenant does not exist.
 *
 * SECURITY: bypasses RLS — ONLY call after verifying the caller is a workspace
 * admin (super_admin). Never expose on a normal tenant route.
 */
export async function getTenantById(tenantId: string): Promise<TenantBasic | null> {
  const [tenant] = await withServiceRole(async (tx) =>
    tx
      .select({
        id: schema.tenants.id,
        name: schema.tenants.name,
        slug: schema.tenants.slug,
      })
      .from(schema.tenants)
      .where(eq(schema.tenants.id, tenantId))
      .limit(1)
  );

  return tenant ?? null;
}
