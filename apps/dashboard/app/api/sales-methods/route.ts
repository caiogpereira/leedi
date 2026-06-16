import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getSession } from '@leedi/auth';
import { env } from '@leedi/config';

/**
 * Same-origin proxy for the global sales-methods catalog (GET). Not
 * tenant-scoped — the onboarding agent step and other clients fetch it relative
 * so the httpOnly session cookie rides along. Forwards to the Hono API.
 */
function apiBaseUrl(): string {
  return env.BETTER_AUTH_URL.replace(':3000', `:${env.API_PORT}`);
}

export async function GET(request: NextRequest) {
  const session = await getSession(request.headers);
  if (!session?.user?.id)
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
  const upstream = await fetch(`${apiBaseUrl()}/api/sales-methods${request.nextUrl.search}`, {
    headers: { cookie: request.headers.get('cookie') ?? '', 'content-type': 'application/json' },
  });
  const payload = await upstream.json().catch(() => ({ error: 'Resposta inválida da API.' }));
  return NextResponse.json(payload, { status: upstream.status });
}
