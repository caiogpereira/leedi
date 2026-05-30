import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getSession, startImpersonation } from '@leedi/auth';
import { env } from '@leedi/config';

const IMPERSONATION_MAX_AGE = 60 * 60; // 1 hour, in seconds — matches the audit TTL.

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
  const session = await getSession(request.headers);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as { tenantId?: unknown } | null;
  const targetTenantId = body?.tenantId;
  if (typeof targetTenantId !== 'string' || targetTenantId.length === 0) {
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
  return response;
}
