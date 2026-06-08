/**
 * Edge-runtime–safe auth helpers for Next.js middleware.
 *
 * This module deliberately imports ONLY `better-auth/cookies` and the pure RBAC
 * matrix — NEVER `@leedi/db` or `@leedi/config`, which load `node:path`/`node:url`
 * at module level and crash the Edge runtime ("Native module not found: node:path").
 *
 * Middleware MUST import from `@leedi/auth/edge`, not the `@leedi/auth` barrel —
 * the barrel re-exports `auth.ts`, which instantiates the Drizzle/pg adapter and
 * reads validated env, pulling the whole Node-only chain into the Edge bundle.
 */
import { getSessionCookie } from 'better-auth/cookies';

// rbac.ts is pure TypeScript (no Node/db deps) — safe to re-export to the Edge.
export {
  getRequiredRoles,
  hasPermission,
  ROLE_PERMISSIONS,
  ROUTE_PERMISSION_MAP,
} from './rbac.js';
export type { TenantRole, WorkspaceRole, Permission } from './rbac.js';

/**
 * Edge-safe optimistic auth check for middleware.
 *
 * Returns true when a Better-Auth session cookie is present on the request. It
 * only inspects the cookie (no DB call), so it is safe in the Edge runtime. Real
 * validation still happens server-side via `getSession`; this just gates routing.
 *
 * It auto-detects the `__Secure-` cookie prefix from the request protocol, so it
 * stays consistent with `advanced.useSecureCookies` in `auth.ts`.
 */
export function hasSessionCookie(request: Request | Headers): boolean {
  return getSessionCookie(request) !== null;
}
