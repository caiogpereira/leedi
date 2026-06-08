import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getSession, stopImpersonation } from '@leedi/auth';

/**
 * Ends impersonation (Story 2.8 AC#3).
 *
 * AUTHORIZATION: requires a valid session, and the session user must match the
 * `leedi_real_user_id` cookie. During impersonation the Better-Auth session still
 * belongs to the real super-admin (impersonation is a cookie overlay), so this
 * prevents an unauthenticated caller from forging the cookies to write a spurious
 * `impersonate_end` audit row.
 *
 * FAIL-OPEN ON EXIT: cookies are cleared FIRST and the audit write is wrapped so a
 * DB error can never leave the admin trapped in the tenant's data scope (the
 * story's explicit pitfall). Clearing `leedi_tenant` is part of that.
 */
export async function POST(request: NextRequest) {
  const tenantId = request.cookies.get('leedi_impersonating')?.value;
  const realUserId = request.cookies.get('leedi_real_user_id')?.value;

  const response = NextResponse.json({ success: true });
  // Clear cookies unconditionally and BEFORE the audit write — exiting tenant
  // scope must never depend on a DB call succeeding.
  response.cookies.delete('leedi_impersonating');
  response.cookies.delete('leedi_real_user_id');
  response.cookies.delete('leedi_tenant');
  response.cookies.delete('leedi_impersonation_expires');

  const session = await getSession(request.headers);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  }

  // Only write the audit row for a genuine session whose user owns these cookies.
  if (tenantId && realUserId && session.user.id === realUserId) {
    try {
      await stopImpersonation(realUserId, tenantId);
    } catch {
      // Cookies are already cleared above; swallow audit-write failures so the
      // admin is never stuck impersonating because the log insert hiccuped.
    }
  }

  return response;
}
