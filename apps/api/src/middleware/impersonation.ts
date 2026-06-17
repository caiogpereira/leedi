import { getWorkspaceAdmin } from '@leedi/auth';
import { withServiceRole, schema, eq } from '@leedi/db';

export interface ImpersonationContext {
  /** The REAL super-admin acting (audit attribution — never the impersonated tenant). */
  realUserId: string;
  /** The admin's workspace UUID (audit_logs.workspace_id). */
  workspaceId: string;
}

/**
 * Decides whether the current request is a valid super-admin impersonation of
 * `tenantId` (Story 2.8 AC#1/AC#2). Pure-ish + heavily unit-tested: the cookie
 * source is injected, and the only side effects are two read-only lookups.
 *
 * Returns the impersonation context when ALL of these hold, else `null` (caller
 * falls back to the normal membership check — fail-closed):
 *   - `leedi_impersonating` cookie equals the route's `tenantId`;
 *   - `leedi_real_user_id` cookie equals the authenticated session user (the cookie
 *     must belong to the caller — a forged cookie for another user is rejected);
 *   - `leedi_impersonation_expires` is in the future (server-side re-validation of
 *     the 1-hour window — the cookie max-age alone is client-trustable);
 *   - the session user is a `super_admin` in `workspace_admins`;
 *   - the target tenant exists (no workspace-scoping — `super_admin` is a
 *     platform-wide role; see `startImpersonation`).
 *
 * These mirror `startImpersonation` exactly, so the API authorization can never be
 * looser (nor stricter) than the impersonation it was granted under.
 */
export async function resolveImpersonation(
  getCookieValue: (name: string) => string | undefined,
  sessionUserId: string,
  tenantId: string,
  now: number = Date.now()
): Promise<ImpersonationContext | null> {
  const impersonating = getCookieValue('leedi_impersonating');
  const realUserId = getCookieValue('leedi_real_user_id');
  const expiresRaw = getCookieValue('leedi_impersonation_expires');

  if (!impersonating || !realUserId) return null;
  if (impersonating !== tenantId) return null;
  if (realUserId !== sessionUserId) return null;

  const expiresAt = Number(expiresRaw);
  if (!Number.isFinite(expiresAt) || expiresAt <= now) return null;

  const admin = await getWorkspaceAdmin(sessionUserId);
  if (admin?.role !== 'super_admin') return null;

  const [tenant] = await withServiceRole(async (tx) =>
    tx
      .select({ id: schema.tenants.id })
      .from(schema.tenants)
      .where(eq(schema.tenants.id, tenantId))
      .limit(1)
  );
  if (!tenant) return null;

  return { realUserId, workspaceId: admin.workspaceId };
}

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/** True for HTTP methods that change state (Story 2.8 AC#2 — audit writes only). */
export function isMutatingMethod(method: string): boolean {
  return MUTATING_METHODS.has(method.toUpperCase());
}
