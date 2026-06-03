import type { Context, Next } from 'hono';
import { hasPermission, type TenantRole, type Permission } from '@leedi/auth';

const FORBIDDEN_MESSAGE = 'Você não tem permissão para acessar esta área';

/**
 * Hono middleware that enforces the caller's tenant role has the required
 * permission (Story 2.5, AC#1/AC#3 — server-side enforcement).
 *
 * Must run AFTER the session/tenant-resolution middleware that sets `ctx.var.role`
 * (wired in a later story; until then the role is undefined and the guard denies,
 * which is the correct fail-closed posture). Rejects with 403 BEFORE invoking any
 * use-case, so no partial side effects are possible.
 *
 * @example
 *   app.use('/settings/billing/*', requirePermission('billing:write'));
 */
export function requirePermission(permission: Permission) {
  return async (ctx: Context, next: Next) => {
    const role = ctx.get('tenantRole') as TenantRole | undefined;
    if (!role || !hasPermission(role, permission)) {
      return ctx.json({ error: FORBIDDEN_MESSAGE }, 403);
    }
    return next();
  };
}
