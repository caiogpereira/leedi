/**
 * Role-Based Access Control (RBAC) — SINGLE SOURCE OF TRUTH for the permission
 * matrix (Story 2.5). No other file may define or duplicate the matrix; every
 * enforcement point (API middleware, dashboard middleware, UI gating) imports
 * from here so the rules stay consistent across the stack.
 *
 * Roles mirror the DB enums exactly:
 *   tenant_role    → owner | admin | operator | viewer   (per-tenant membership)
 *   workspace_role → super_admin | support               (platform staff)
 *
 * Role is PER-TENANT: the same user may be `owner` in tenant A and `viewer` in
 * tenant B. Callers must always pass the role resolved for the current tenant.
 */

export type TenantRole = 'owner' | 'admin' | 'operator' | 'viewer';
export type WorkspaceRole = 'super_admin' | 'support';

export type Permission =
  | 'billing:read'
  | 'billing:write'
  | 'agent:configure'
  | 'team:manage'
  | 'leads:write'
  | 'leads:read'
  | 'messages:send'
  | 'dashboard:read'
  | 'settings:read';

export const ROLE_PERMISSIONS: Record<TenantRole, readonly Permission[]> = {
  owner: [
    'billing:read',
    'billing:write',
    'agent:configure',
    'team:manage',
    'leads:write',
    'leads:read',
    'messages:send',
    'dashboard:read',
    'settings:read',
  ],
  admin: [
    'agent:configure',
    'team:manage',
    'leads:write',
    'leads:read',
    'messages:send',
    'dashboard:read',
    'settings:read',
  ],
  operator: ['leads:write', 'leads:read', 'messages:send', 'dashboard:read'],
  viewer: ['leads:read', 'dashboard:read'],
} as const;

export function hasPermission(role: TenantRole, permission: Permission): boolean {
  return (ROLE_PERMISSIONS[role] as readonly string[]).includes(permission);
}

/**
 * Route-to-required-roles map for dashboard middleware enforcement.
 *
 * Matched by prefix (see `getRequiredRoles`), so `/settings/billing/details`
 * inherits `/settings/billing`'s requirement. ORDER MATTERS: more specific
 * prefixes must precede the broader `/settings` fallback.
 */
export const ROUTE_PERMISSION_MAP: Record<string, readonly TenantRole[]> = {
  '/settings/billing': ['owner'],
  '/settings/agent': ['owner', 'admin'],
  '/settings/team': ['owner', 'admin'],
  '/settings': ['owner', 'admin'],
} as const;

export function getRequiredRoles(pathname: string): readonly TenantRole[] | null {
  for (const [route, roles] of Object.entries(ROUTE_PERMISSION_MAP)) {
    if (pathname.startsWith(route)) {
      return roles;
    }
  }
  return null; // no restriction
}
