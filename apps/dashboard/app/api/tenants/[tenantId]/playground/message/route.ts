import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getSession } from '@leedi/auth';
import { env } from '@leedi/config';

/**
 * Same-origin proxy for the playground (sandbox) message turn.
 *
 * The playground client fetches a relative path so the httpOnly session cookie
 * (host-scoped on localhost, shared across ports) rides along. This handler
 * forwards the JSON body + cookie to the Hono API, which re-validates session +
 * tenant membership and runs the agent in sandbox mode. API base URL derivation
 * mirrors the other proxies (:3000 → API_PORT).
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
    return NextResponse.json({ error: 'Parâmetros ausentes.' }, { status: 400 });
  }

  const bodyText = await request.text();
  const cookieHeader = request.headers.get('cookie') ?? '';

  const upstream = await fetch(
    `${apiBaseUrl()}/api/tenants/${encodeURIComponent(tenantId)}/playground/message`,
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
