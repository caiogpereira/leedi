import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import {
  getSession,
  getRequiredRoles,
  getWorkspaceAdminRole,
  type TenantRole,
} from "@leedi/auth";
import { getTenantById, listUserTenants, type UserTenant } from "@leedi/tenancy";

/**
 * Resolved per-tenant context for the current request (Story 2.5 / 2.7).
 *
 * `role` is the caller's role IN the active tenant — a user can be `owner` in
 * tenant A and `viewer` in tenant B, so it is always resolved per tenant.
 */
export interface TenantContext {
  userId: string;
  tenant: UserTenant;
  role: TenantRole;
}

/**
 * Resolves the caller's active tenant and their role in it, from the
 * MEMBERSHIP-BACKED `listUserTenants` (never from the raw cookie/header, which
 * the Edge runtime cannot verify and is therefore attacker-controllable).
 *
 * The `x-leedi-tenant-id` header (forwarded by middleware from the `leedi_tenant`
 * cookie) is used only to PICK among the user's real memberships — if it doesn't
 * match one, we fall back to the first membership. This is the single place
 * dashboard Server Components should resolve the active role, replacing the
 * per-page re-implementations and the `userRole = undefined` placeholders that
 * Story 2.7 was meant to remove.
 *
 * Returns `null` when there is no session or the user has no memberships AND is
 * not currently impersonating a tenant.
 *
 * IMPERSONATION (Story 2.8 / F-30): a `super_admin` is not a member of the tenant
 * they impersonate, so the membership path below would resolve `null` and every
 * page would render "Nenhum workspace encontrado" / redirect to `/403`. When a
 * valid impersonation overlay is present we synthesize an `owner`-role context for
 * the impersonated tenant — matching the `(shell)/layout.tsx` shell, which already
 * resolves the active tenant from the same cookies. The validation here mirrors
 * `startImpersonation` / the API `resolveImpersonation` (expiry + super_admin +
 * cookie-owner == session user + tenant exists), fail-closed to the membership
 * path on any mismatch.
 */
export async function getCurrentTenantContext(): Promise<TenantContext | null> {
  const requestHeaders = await headers();
  const session = await getSession(requestHeaders);
  if (!session?.user?.id) return null;

  const impersonated = await resolveImpersonatedContext(session.user.id);
  if (impersonated) return impersonated;

  const tenants = await listUserTenants(session.user.id);
  if (tenants.length === 0) return null;

  const headerTenantId = requestHeaders.get("x-leedi-tenant-id");
  const tenant =
    tenants.find((t) => t.tenantId === headerTenantId) ?? tenants[0]!;

  return { userId: session.user.id, tenant, role: tenant.role };
}

/**
 * Resolves the impersonated-tenant context for `sessionUserId`, or `null` when
 * there is no valid impersonation overlay (so the caller falls back to the normal
 * membership path — fail-closed). Reads the same httpOnly cookies the admin app
 * set and the dashboard shell already trusts.
 */
async function resolveImpersonatedContext(
  sessionUserId: string,
): Promise<TenantContext | null> {
  const cookieStore = await cookies();
  const impersonatingTenantId = cookieStore.get("leedi_impersonating")?.value;
  if (!impersonatingTenantId) return null;

  // The impersonation cookie must belong to the caller (a forged cookie naming
  // another user's session is rejected), and the 1-hour window must be unexpired.
  if (cookieStore.get("leedi_real_user_id")?.value !== sessionUserId) return null;
  const expiresAt = Number(cookieStore.get("leedi_impersonation_expires")?.value);
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) return null;

  // Only a super_admin may impersonate (platform-wide role — no workspace scoping).
  if ((await getWorkspaceAdminRole(sessionUserId)) !== "super_admin") return null;

  const tenant = await getTenantById(impersonatingTenantId);
  if (!tenant) return null;

  // Full support access while impersonating (the point of impersonation is
  // auditable write-access — every mutating API call is audited server-side).
  return {
    userId: sessionUserId,
    tenant: {
      tenantId: tenant.id,
      name: tenant.name,
      slug: tenant.slug,
      logoUrl: null,
      role: "owner",
    },
    role: "owner",
  };
}

/**
 * Enforces the RBAC route requirement for `route` (Story 2.5 AC#1/AC#3) and
 * returns the resolved context.
 *
 * This is the authoritative per-page enforcement point. The Edge middleware
 * CANNOT do this — it has no DB access to resolve the per-tenant role — so the
 * route gate was removed from there and lives here, where the membership-backed
 * role is available. `ROUTE_PERMISSION_MAP` (via `getRequiredRoles`) stays the
 * single source of truth; the page passes its own static route, so no `pathname`
 * is needed (Server Component layouts/pages don't receive one).
 *
 * On insufficient/absent role, redirects to `/403` (fail-closed).
 */
export async function requireTenantRouteAccess(
  route: string,
): Promise<TenantContext> {
  const ctx = await getCurrentTenantContext();
  const required = getRequiredRoles(route);

  if (required && (!ctx || !required.includes(ctx.role))) {
    redirect("/403");
  }
  if (!ctx) {
    // A restricted page with no resolvable tenant context is denied.
    redirect("/403");
  }
  return ctx;
}
