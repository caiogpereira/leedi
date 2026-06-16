import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getSession } from '@leedi/auth';
import { env } from '@leedi/config';

/** Same-origin proxy for a single conversation's detail + message history (GET, with cursor query). */
function apiBaseUrl(): string {
  return env.BETTER_AUTH_URL.replace(':3000', `:${env.API_PORT}`);
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ tenantId: string; windowId: string }> }
) {
  const session = await getSession(request.headers);
  if (!session?.user?.id)
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
  const { tenantId, windowId } = await context.params;
  const upstream = await fetch(
    `${apiBaseUrl()}/api/tenants/${encodeURIComponent(tenantId)}/inbox/${encodeURIComponent(windowId)}${request.nextUrl.search}`,
    { headers: { cookie: request.headers.get('cookie') ?? '', 'content-type': 'application/json' } }
  );
  const payload = await upstream.json().catch(() => ({ error: 'Resposta inválida da API.' }));
  return NextResponse.json(payload, { status: upstream.status });
}
