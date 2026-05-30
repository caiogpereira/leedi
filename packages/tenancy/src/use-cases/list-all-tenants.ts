import { withServiceRole, schema } from '@leedi/db';

export interface TenantSummary {
  id: string;
  name: string;
  slug: string;
  status: string;
  plan: string;
  createdAt: Date;
}

/**
 * Lists ALL tenants — the deliberate, audited exception to tenant RLS (Story 2.8).
 * Bypasses the per-tenant policy via `withServiceRole` (SET LOCAL row_security =
 * off), which is reserved EXCLUSIVELY for the workspace-admin path.
 *
 * SECURITY: this is the highest-risk surface in the app. ONLY call it after
 * verifying the caller is a workspace admin (`getWorkspaceAdminRole`). Never
 * expose it on a normal tenant route — it would leak every tenant's data.
 */
export async function listAllTenants(): Promise<TenantSummary[]> {
  return withServiceRole(async (tx) =>
    tx
      .select({
        id: schema.tenants.id,
        name: schema.tenants.name,
        slug: schema.tenants.slug,
        status: schema.tenants.status,
        plan: schema.tenants.plan,
        createdAt: schema.tenants.createdAt,
      })
      .from(schema.tenants)
  );
}
