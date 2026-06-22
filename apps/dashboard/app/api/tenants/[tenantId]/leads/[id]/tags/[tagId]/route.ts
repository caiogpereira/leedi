import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getSession } from '@leedi/auth';
import { internalApiUrl } from '../../../../../../../../lib/internal-api-url';

/**
 * Same-origin proxy for removing a tag from a lead (Story 5.4).
 *
 * Forwards the DELETE (no body) plus the cookie header to the Hono API. The API
 * returns 204 on success; we must NOT call upstream.json() on a 204 (it throws
 * on an empty body), so we special-case no-content and re-emit a bare 204.
 */
function apiBaseUrl(): string {
  return internalApiUrl();
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ tenantId: string; id: string; tagId: string }> }
) {
  const session = await getSession(request.headers);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
  }

  const { tenantId, id, tagId } = await context.params;
  if (!tenantId || !id || !tagId) {
    return NextResponse.json({ error: 'Parâmetros ausentes.' }, { status: 400 });
  }

  const cookieHeader = request.headers.get('cookie') ?? '';

  const upstream = await fetch(
    `${apiBaseUrl()}/api/tenants/${encodeURIComponent(tenantId)}/leads/${encodeURIComponent(
      id
    )}/tags/${encodeURIComponent(tagId)}`,
    {
      method: 'DELETE',
      headers: { cookie: cookieHeader },
    }
  );

  if (upstream.status === 204) {
    return new NextResponse(null, { status: 204 });
  }

  const payload = await upstream
    .json()
    .catch(() => ({ error: 'Resposta inválida da API.' }));
  return NextResponse.json(payload, { status: upstream.status });
}
