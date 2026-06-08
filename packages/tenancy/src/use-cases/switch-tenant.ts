import { withUser, withServiceRole, schema, eq, and } from '@leedi/db';

export type SwitchTenantResult =
  | { success: true }
  | { success: false; error: string };

const ACCESS_DENIED_MESSAGE = 'Acesso negado a este tenant';
const INACTIVE_TENANT_MESSAGE = 'Esta empresa está suspensa ou cancelada';

// Tenant statuses a user may actively switch into. `blocked`/`cancelled` tenants
// are off-limits even to legitimate members.
const SWITCHABLE_STATUSES = ['active', 'trial'] as const;

/**
 * Authorizes switching the session's active tenant to `targetTenantId`.
 *
 * This use-case is the SET-TIME authorization boundary: it re-verifies, server
 * side, that `userId` holds an active membership in `targetTenantId` before the
 * caller (the /api/tenant/switch route) writes the `leedi_tenant` cookie. The
 * client-supplied tenantId is never trusted.
 *
 * It uses `withUser` because no tenant is selected yet — the memberships RLS
 * policy permits `user_id = app.user_id` reads without an `app.tenant_id`.
 *
 * IMPORTANT — where verification actually lives:
 * - SET-TIME: here. A non-member never gets the cookie set.
 * - READ-TIME: any consumer of the active tenant (e.g. the dashboard layout) MUST
 *   re-validate the tenant against the user's memberships before using it for data
 *   access. The middleware that forwards the cookie is Edge (no DB) and therefore
 *   CANNOT verify membership — the forwarded header is attacker-controllable and
 *   must not be trusted on its own.
 *
 * RBAC: role is re-resolved per tenant by `listUserTenants` — a user can be owner
 * in tenant A and viewer in tenant B.
 */
export async function switchTenant(
  userId: string,
  targetTenantId: string
): Promise<SwitchTenantResult> {
  const [membership] = await withUser(userId, async (tx) =>
    tx
      .select({ role: schema.memberships.role })
      .from(schema.memberships)
      .where(
        and(
          eq(schema.memberships.userId, userId),
          eq(schema.memberships.tenantId, targetTenantId)
        )
      )
      .limit(1)
  );

  if (!membership) {
    return { success: false, error: ACCESS_DENIED_MESSAGE };
  }

  // Membership proves authorization; now gate on tenant lifecycle status. A valid
  // member must still not be able to activate a blocked/cancelled tenant context.
  // Service-role read because the user has no active tenant context yet (the
  // memberships RLS path scopes by user, not tenant).
  const [tenant] = await withServiceRole(async (tx) =>
    tx
      .select({ status: schema.tenants.status })
      .from(schema.tenants)
      .where(eq(schema.tenants.id, targetTenantId))
      .limit(1)
  );

  if (!tenant) {
    return { success: false, error: ACCESS_DENIED_MESSAGE };
  }
  if (!SWITCHABLE_STATUSES.includes(tenant.status as (typeof SWITCHABLE_STATUSES)[number])) {
    return { success: false, error: INACTIVE_TENANT_MESSAGE };
  }

  return { success: true };
}
