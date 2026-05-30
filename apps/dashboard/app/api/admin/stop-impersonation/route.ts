import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { stopImpersonation } from '@leedi/auth';

/**
 * Ends impersonation (Story 2.8 AC#3).
 *
 * Reads the real super-admin id and target tenant from the impersonation cookies,
 * writes the `impersonate_end` audit log (attributed to the REAL actor, never the
 * tenant), then clears ALL impersonation-related cookies — including `leedi_tenant`.
 *
 * Clearing `leedi_tenant` is critical: leaving it set would keep the admin scoped
 * to the tenant's data after exiting (the story's explicit pitfall). Cookies are
 * cleared regardless of whether the audit write succeeded — staying trapped in
 * the tenant context is the more dangerous failure (fail-open on EXIT).
 */
export async function POST(request: NextRequest) {
  const tenantId = request.cookies.get('leedi_impersonating')?.value;
  const realUserId = request.cookies.get('leedi_real_user_id')?.value;

  if (tenantId && realUserId) {
    await stopImpersonation(realUserId, tenantId);
  }

  const response = NextResponse.json({ success: true });
  response.cookies.delete('leedi_impersonating');
  response.cookies.delete('leedi_real_user_id');
  response.cookies.delete('leedi_tenant');
  return response;
}
