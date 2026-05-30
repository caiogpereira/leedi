import { withUser, schema, eq, and } from '@leedi/db';

export type SwitchTenantResult =
  | { success: true }
  | { success: false; error: string };

const ACCESS_DENIED_MESSAGE = 'Acesso negado a este tenant';

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

  return { success: true };
}
