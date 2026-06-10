import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getSession, getRequiredRoles, type TenantRole } from "@leedi/auth";
import { listUserTenants, type UserTenant } from "@leedi/tenancy";

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
 * Returns `null` when there is no session or the user has no memberships (e.g. a
 * super-admin impersonating a tenant they are not a member of — impersonation
 * settings access remains a documented limitation, tracked in deferred-work).
 */
export async function getCurrentTenantContext(): Promise<TenantContext | null> {
  const requestHeaders = await headers();
  const session = await getSession(requestHeaders);
  if (!session?.user?.id) return null;

  const tenants = await listUserTenants(session.user.id);
  if (tenants.length === 0) return null;

  const headerTenantId = requestHeaders.get("x-leedi-tenant-id");
  const tenant =
    tenants.find((t) => t.tenantId === headerTenantId) ?? tenants[0]!;

  return { userId: session.user.id, tenant, role: tenant.role };
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
