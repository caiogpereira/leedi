import { withUser, withTenant, schema, eq } from '@leedi/db';
import type { TenantRole } from '@leedi/auth';

export interface UserTenant {
  tenantId: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  role: TenantRole;
}

/**
 * Returns all tenants the given user is a member of, with their role in each.
 *
 * TWO-PHASE by necessity (RLS):
 *   1. `withUser(userId)` reads `memberships` — the memberships RLS policy allows
 *      `user_id = app.user_id` reads even with NO tenant selected (Story 2.4 /
 *      migration 0000). This is the only context available at login-routing time.
 *   2. The `tenants` table RLS policy is scoped STRICTLY to `id = app.tenant_id`
 *      (FORCE RLS, no user_id escape hatch), so a join from a `withUser` context
 *      returns ZERO tenant rows. Each tenant's details must therefore be read in
 *      its own `withTenant(tenantId)` context, which makes exactly that row visible.
 *
 * N is the user's tenant count (small in practice), so the per-tenant lookup is
 * acceptable and never leaks tenants the user has no active membership in.
 *
 * Security: strictly scoped to the authenticated user_id. The membership read is
 * the authorization boundary — only tenants returned in phase 1 are ever fetched.
 */
export async function listUserTenants(userId: string): Promise<UserTenant[]> {
  const memberships = await withUser(userId, async (tx) =>
    tx
      .select({
        tenantId: schema.memberships.tenantId,
        role: schema.memberships.role,
      })
      .from(schema.memberships)
      .where(eq(schema.memberships.userId, userId))
  );

  const tenants = await Promise.all(
    memberships.map(async (m) => {
      const [tenant] = await withTenant(m.tenantId, async (tx) =>
        tx
          .select({
            name: schema.tenants.name,
            slug: schema.tenants.slug,
            logoUrl: schema.tenants.logoUrl,
          })
          .from(schema.tenants)
          .where(eq(schema.tenants.id, m.tenantId))
          .limit(1)
      );

      // Defensive: a membership pointing at a missing tenant is skipped rather
      // than surfacing a half-populated row to the UI.
      if (!tenant) {
        return null;
      }

      return {
        tenantId: m.tenantId,
        name: tenant.name,
        slug: tenant.slug,
        logoUrl: tenant.logoUrl,
        role: m.role,
      } satisfies UserTenant;
    })
  );

  return tenants.filter((t): t is UserTenant => t !== null);
}
