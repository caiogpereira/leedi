import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getSession, startImpersonation } from '@leedi/auth';
import { env } from '@leedi/config';

const IMPERSONATION_MAX_AGE = 60 * 60; // 1 hour, in seconds — matches the audit TTL.

// RFC 4122 UUID shape. `tenantId` lands in `audit_logs.target_tenant_id` (a uuid
// column), so a non-UUID would throw a DB error (500); reject it up front (400).
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Starts impersonation (Story 2.8 AC#1).
 *
 * SERVER-SIDE AUTHORIZATION: `startImpersonation` re-resolves the actor's
 * `workspace_admins` row and rejects anyone who is not `super_admin` (the
 * client-supplied tenantId is never trusted for authorization). It also writes
 * the `impersonate_start` audit log and returns the real `workspaceId`.
 *
 * On success this route sets three cookies:
 *   - `leedi_impersonating`  → target tenantId (banner + read-time bypass signal)
 *   - `leedi_real_user_id`   → the super-admin's id (audit attribution on exit)
 *   - `leedi_tenant`         → target tenantId, so the dashboard middleware
 *                              forwards `x-leedi-tenant-id` and tenant-scoped
 *                              Server Components run under the impersonated tenant
 *                              (Task 6: data scope via `withTenant`).
 *
 * All three are httpOnly with a 1-hour max-age so impersonation expires on its
 * own (NOT renewable without re-auth — fail-closed to admin context).
 */
export async function POST(request: NextRequest) {
  // CSRF defense-in-depth (PL-5): this state-changing Route Handler is not a
  // Server Action, so reject positive cross-origin evidence before doing any
  // work. The admin UI calls this same-origin; `SameSite=Lax` stays the primary
  // control. (Inlined, not shared — the admin app has no middleware and the
  // dashboard helper lives in a different app; same conservative logic.)
  const secFetchSite = request.headers.get('sec-fetch-site');
  const origin = request.headers.get('origin');
  let crossOrigin = secFetchSite === 'cross-site';
  if (!crossOrigin && origin) {
    try {
      crossOrigin = new URL(origin).host !== request.nextUrl.host;
    } catch {
      crossOrigin = true;
    }
  }
  if (crossOrigin) {
    return NextResponse.json({ error: 'Origem não permitida' }, { status: 403 });
  }

  const session = await getSession(request.headers);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as { tenantId?: unknown } | null;
  const targetTenantId = body?.tenantId;
  if (typeof targetTenantId !== 'string' || !UUID_RE.test(targetTenantId)) {
    return NextResponse.json({ error: 'tenantId inválido' }, { status: 400 });
  }

  const result = await startImpersonation(session.user.id, targetTenantId);
  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 403 });
  }

  const response = NextResponse.json({ success: true });
  const cookieOptions = {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    maxAge: IMPERSONATION_MAX_AGE,
    path: '/',
  };
  response.cookies.set('leedi_impersonating', targetTenantId, cookieOptions);
  response.cookies.set('leedi_real_user_id', session.user.id, cookieOptions);
  response.cookies.set('leedi_tenant', targetTenantId, cookieOptions);
  // Authoritative expiry, re-validated server-side by the dashboard shell on
  // every render (the cookie max-age alone is client-trustable and could be
  // refreshed/extended). Story 2.8 pitfall: no silent renewal past 1 hour.
  response.cookies.set('leedi_impersonation_expires', String(result.expiresAt), cookieOptions);
  return response;
}
