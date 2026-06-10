import { getSession } from '@leedi/auth';
import { db, withUser, schema, eq, and } from '@leedi/db';
import type { TenantRole } from '@leedi/auth';
import type { Context, Next } from 'hono';
import {
  resolveImpersonation,
  isMutatingMethod,
  type ImpersonationContext,
} from './impersonation.js';

declare module 'hono' {
  interface ContextVariableMap {
    userId: string;
    tenantRole: TenantRole;
    resolvedTenantId: string;
    /** Set only when the request is a valid super-admin impersonation (Story 2.8). */
    impersonation?: ImpersonationContext;
  }
}

/** Reads a single cookie value from the request's `cookie` header (no deps). */
function readCookie(c: Context, name: string): string | undefined {
  const header = c.req.header('cookie');
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const eqIdx = part.indexOf('=');
    if (eqIdx === -1) continue;
    if (part.slice(0, eqIdx).trim() === name) {
      return decodeURIComponent(part.slice(eqIdx + 1).trim());
    }
  }
  return undefined;
}

/**
 * Reads the better-auth session and resolves the caller's role in the target tenant.
 * Sets `userId`, `tenantRole`, and `resolvedTenantId` on context.
 *
 * Requires `:tenantId` path param. Rejects with 401 (no session) or 403 (not a member).
 * Pass `requiredRole` to additionally enforce role equality (e.g., 'owner').
 *
 * IMPERSONATION (Story 2.8): when the caller is a super-admin impersonating this
 * tenant (validated against the impersonation cookies — see `resolveImpersonation`),
 * they are authorized at owner level WITHOUT a membership, and EVERY mutating request
 * is written to `audit_logs` (actor = real super-admin, target = tenant) BEFORE the
 * handler runs. The audit is fail-closed: if it cannot be written, the request is
 * rejected (no silent, unaudited impersonated writes).
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

    // ── Impersonation path (super-admin acting as the tenant) ──────────────────
    const impersonation = await resolveImpersonation(
      (name) => readCookie(c, name),
      userId,
      tenantId
    );
    if (impersonation) {
      // AC#2: audit every mutating action, fail-closed, before it runs.
      if (isMutatingMethod(c.req.method)) {
        try {
          await db.insert(schema.auditLogs).values({
            workspaceId: impersonation.workspaceId,
            actorUserId: impersonation.realUserId,
            targetTenantId: tenantId,
            acao: 'impersonation_write',
            detalhes: {
              method: c.req.method,
              path: new URL(c.req.url).pathname,
            },
          });
        } catch {
          return c.json(
            { error: 'Não foi possível registrar a auditoria da ação.' },
            503
          );
        }
      }
      // Super-admin gets owner-level access while impersonating (highest role —
      // satisfies any requiredRole / permission check downstream).
      c.set('userId', userId);
      c.set('tenantRole', 'owner');
      c.set('resolvedTenantId', tenantId);
      c.set('impersonation', impersonation);
      return next();
    }

    // ── Normal membership path ─────────────────────────────────────────────────
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
