import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getSession } from '@leedi/auth';
import { env } from '@leedi/config';

/**
 * Same-origin proxy for resetting a playground (sandbox) session.
 *
 * Forwards the DELETE + cookie to the Hono API, which re-validates session +
 * tenant membership and clears the sandbox session. API base URL derivation
 * mirrors the other proxies (:3000 → API_PORT).
 */
function apiBaseUrl(): string {
  return env.BETTER_AUTH_URL.replace(':3000', `:${env.API_PORT}`);
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ tenantId: string; sessionId: string }> }
) {
  const session = await getSession(request.headers);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
  }

  const { tenantId, sessionId } = await context.params;
  if (!tenantId || !sessionId) {
    return NextResponse.json({ error: 'Parâmetros ausentes.' }, { status: 400 });
  }

  const cookieHeader = request.headers.get('cookie') ?? '';

  const upstream = await fetch(
    `${apiBaseUrl()}/api/tenants/${encodeURIComponent(tenantId)}/playground/session/${encodeURIComponent(
      sessionId
    )}`,
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
