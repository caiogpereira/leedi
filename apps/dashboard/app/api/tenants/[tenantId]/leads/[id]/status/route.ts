import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getSession } from '@leedi/auth';
import { internalApiUrl } from '../../../../../../../lib/internal-api-url';

/**
 * Same-origin proxy for changing a lead's status (opt-out / reactivate, Story 5.4).
 *
 * Forwards the PATCH JSON body plus the cookie header to the Hono API. The API
 * derives operadorId from the session — the body only carries the target status.
 */
function apiBaseUrl(): string {
  return internalApiUrl();
}

export async function PATCH(
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
    )}/status`,
    {
      method: 'PATCH',
      headers: { cookie: cookieHeader, 'content-type': 'application/json' },
      body: bodyText,
    }
  );

  const payload = await upstream
    .json()
    .catch(() => ({ error: 'Resposta inválida da API.' }));
  return NextResponse.json(payload, { status: upstream.status });
}
