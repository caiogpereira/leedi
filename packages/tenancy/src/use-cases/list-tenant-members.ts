import { withTenant, schema, eq } from '@leedi/db';
import type { TenantRole } from '@leedi/auth';

export interface TenantMember {
  userId: string;
  email: string;
  name: string | null;
  role: TenantRole;
}

/**
 * Lists the active members of a tenant with their role (Story 2.6 AC#1 — team table).
 *
 * Runs under `withTenant` so the `memberships` RLS policy scopes the rows to this
 * tenant. `users` is not tenant-scoped, so the join to fetch email/name is safe.
 * Strictly tenant-scoped: callers must already be authorized for `tenantId`
 * (the team page gates on owner/admin via `requireTenantRouteAccess`).
 */
export async function listTenantMembers(tenantId: string): Promise<TenantMember[]> {
  return withTenant(tenantId, async (tx) =>
    tx
      .select({
        userId: schema.memberships.userId,
        email: schema.users.email,
        name: schema.users.name,
        role: schema.memberships.role,
      })
      .from(schema.memberships)
      .innerJoin(schema.users, eq(schema.users.id, schema.memberships.userId))
      .where(eq(schema.memberships.tenantId, tenantId))
  );
}
