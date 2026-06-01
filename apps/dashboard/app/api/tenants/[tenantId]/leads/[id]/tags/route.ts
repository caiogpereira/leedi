import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getSession } from '@leedi/auth';
import { env } from '@leedi/config';

/**
 * Same-origin proxy for adding a tag to a lead (Story 5.4).
 *
 * The interactive lead-detail client fetches relative paths so the httpOnly
 * session cookie (host-scoped on localhost, shared across ports) is sent. This
 * handler forwards the JSON body plus the cookie header to the Hono API, which
 * re-validates session + tenant membership. API base URL derivation mirrors the
 * import proxy (:3000 → API_PORT).
 */
function apiBaseUrl(): string {
  return env.BETTER_AUTH_URL.replace(':3000', `:${env.API_PORT}`);
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ tenantId: string; id: string }> }
) {
  const session = await getSession(request.headers);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
  }

  const { tenantId, id } = await context.params;
  if (!tenantId || !id) {
    return NextResponse.json({ error: 'Parâmetros ausentes.' }, { status: 400 });
  }

  const bodyText = await request.text();
  const cookieHeader = request.headers.get('cookie') ?? '';

  const upstream = await fetch(
    `${apiBaseUrl()}/api/tenants/${encodeURIComponent(tenantId)}/leads/${encodeURIComponent(
      id
    )}/tags`,
    {
      method: 'POST',
      headers: { cookie: cookieHeader, 'content-type': 'application/json' },
      body: bodyText,
    }
  );

  const payload = await upstream
    .json()
    .catch(() => ({ error: 'Resposta inválida da API.' }));
  return NextResponse.json(payload, { status: upstream.status });
}
