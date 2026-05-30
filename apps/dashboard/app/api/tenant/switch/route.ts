import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getSession } from '@leedi/auth';
import { switchTenant } from '@leedi/tenancy';
import { env } from '@leedi/config';

/**
 * Switches the caller's active tenant (Story 2.7 AC#2).
 *
 * SET-TIME authorization: `switchTenant` re-verifies the membership server-side
 * (never trusts the client-supplied tenantId) before this route writes the
 * `leedi_tenant` cookie. The middleware later forwards that cookie to Server
 * Components as `x-leedi-tenant-id`, but it CANNOT verify membership (Edge, no
 * DB) — so the layout re-validates the value at read-time against the user's
 * memberships. This route is the only place the cookie is set.
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

  const result = await switchTenant(session.user.id, targetTenantId);
  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 403 });
  }

  const response = NextResponse.json({ success: true });
  response.cookies.set('leedi_tenant', targetTenantId, {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 7, // 7 days — matches the session lifetime
    path: '/',
  });

  return response;
}
