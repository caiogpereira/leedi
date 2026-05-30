'use client';

import { hasPermission, type TenantRole, type Permission } from '@leedi/auth';

/**
 * Returns a `can(permission)` function scoped to the given tenant role, for
 * UI-level gating (hiding/disabling create/edit/delete controls — Story 2.5 AC#2).
 *
 * This is UX only — defense in depth. Server-side enforcement (route middleware
 * + use-case guards via `hasPermission`) is ALWAYS required in addition; never
 * rely on this hook as the security boundary.
 *
 * Role is per-tenant, so it is passed in by the caller (resolved for the active
 * tenant) rather than read from a global here.
 *
 * @example
 *   const { can } = usePermission(userRole);
 *   if (can('agent:configure')) { ...render the edit button... }
 */
export function usePermission(role: TenantRole) {
  return {
    can: (permission: Permission) => hasPermission(role, permission),
    role,
  };
}
