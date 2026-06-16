import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getSession } from '@leedi/auth';
import { env } from '@leedi/config';

/** Same-origin proxy for inbox takeover / return-to-bot / resolve (PATCH /:windowId/assign). */
function apiBaseUrl(): string {
  return env.BETTER_AUTH_URL.replace(':3000', `:${env.API_PORT}`);
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ tenantId: string; windowId: string }> }
) {
  const session = await getSession(request.headers);
  if (!session?.user?.id)
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
  const { tenantId, windowId } = await context.params;
  const bodyText = await request.text();
  const upstream = await fetch(
    `${apiBaseUrl()}/api/tenants/${encodeURIComponent(tenantId)}/inbox/${encodeURIComponent(windowId)}/assign`,
    {
      method: 'PATCH',
      headers: { cookie: request.headers.get('cookie') ?? '', 'content-type': 'application/json' },
      body: bodyText,
    }
  );
  const payload = await upstream.json().catch(() => ({ error: 'Resposta inválida da API.' }));
  return NextResponse.json(payload, { status: upstream.status });
}
