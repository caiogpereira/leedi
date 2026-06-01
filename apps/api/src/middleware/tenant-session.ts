import { getSession } from '@leedi/auth';
import { withUser, schema, eq, and } from '@leedi/db';
import type { TenantRole } from '@leedi/auth';
import type { Context, Next } from 'hono';

declare module 'hono' {
  interface ContextVariableMap {
    userId: string;
    tenantRole: TenantRole;
    resolvedTenantId: string;
  }
}

/**
 * Reads the better-auth session and resolves the caller's role in the target tenant.
 * Sets `userId`, `tenantRole`, and `resolvedTenantId` on context.
 *
 * Requires `:tenantId` path param. Rejects with 401 (no session) or 403 (not a member).
 * Pass `requiredRole` to additionally enforce role equality (e.g., 'owner').
 */
export function requireTenantSession(requiredRole?: TenantRole) {
  return async (c: Context, next: Next) => {
    const session = await getSession(c.req.raw.headers);
    if (!session) {
      return c.json({ error: 'Não autenticado.' }, 401);
    }

    const tenantId = c.req.param('tenantId');
    if (!tenantId) {
      return c.json({ error: 'tenantId ausente.' }, 400);
    }

    const userId = session.user.id;

    const rows = await withUser(userId, async (tx) =>
      tx
        .select({ role: schema.memberships.role })
        .from(schema.memberships)
        .where(
          and(
            eq(schema.memberships.userId, userId),
            eq(schema.memberships.tenantId, tenantId)
          )
        )
        .limit(1)
    );

    const membership = rows[0];
    if (!membership) {
      return c.json({ error: 'Acesso negado.' }, 403);
    }

    if (requiredRole && membership.role !== requiredRole) {
      return c.json({ error: 'Acesso negado.' }, 403);
    }

    c.set('userId', userId);
    c.set('tenantRole', membership.role);
    c.set('resolvedTenantId', tenantId);
    return next();
  };
}
