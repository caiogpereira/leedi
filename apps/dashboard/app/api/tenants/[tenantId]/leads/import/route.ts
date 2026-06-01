import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getSession } from '@leedi/auth';
import { env } from '@leedi/config';

/**
 * Proxies a CSV lead-import upload from the browser to the Hono API (Story 5.3).
 *
 * Why a proxy: the CSV parser and the import route live in `apps/api` (Hono,
 * port 3003), which the dashboard cannot import across app boundaries. This thin
 * handler lets the client POST to a same-origin relative path (so the
 * httpOnly session cookie is sent) and forwards the multipart body, plus the
 * incoming `cookie` header, server-to-server. On localhost cookies are
 * host-scoped (shared across ports), so the API can authenticate the request.
 *
 * The API base URL is derived from BETTER_AUTH_URL the same way as
 * apps/api/src/routes/webhook-meta.ts (:3000 → :3003).
 */
function apiBaseUrl(): string {
  return env.BETTER_AUTH_URL.replace(':3000', `:${env.API_PORT}`);
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ tenantId: string }> }
) {
  const session = await getSession(request.headers);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
  }

  const { tenantId } = await context.params;
  if (!tenantId) {
    return NextResponse.json({ error: 'tenantId ausente.' }, { status: 400 });
  }

  // Re-stream the incoming multipart body to the API untouched. The API
  // re-validates the session and the tenant membership, so this proxy performs
  // no trust-bearing checks of its own beyond requiring a session.
  const formData = await request.formData();

  const cookieHeader = request.headers.get('cookie') ?? '';

  const upstream = await fetch(
    `${apiBaseUrl()}/api/tenants/${encodeURIComponent(tenantId)}/leads/import`,
    {
      method: 'POST',
      headers: { cookie: cookieHeader },
      body: formData,
    }
  );

  // Pass through the API response verbatim (status + JSON body).
  const payload = await upstream.json().catch(() => ({ error: 'Resposta inválida da API.' }));
  return NextResponse.json(payload, { status: upstream.status });
}
