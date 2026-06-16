import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getSession } from '@leedi/auth';
import { env } from '@leedi/config';

/** Same-origin proxy for usage settings (e.g. overage toggle). */
function apiBaseUrl(): string {
  return env.BETTER_AUTH_URL.replace(':3000', `:${env.API_PORT}`);
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ tenantId: string }> }
) {
  const session = await getSession(request.headers);
  if (!session?.user?.id)
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
  const { tenantId } = await context.params;
  const bodyText = await request.text();
  const upstream = await fetch(
    `${apiBaseUrl()}/api/tenants/${encodeURIComponent(tenantId)}/usage/settings`,
    {
      method: 'PATCH',
      headers: { cookie: request.headers.get('cookie') ?? '', 'content-type': 'application/json' },
      body: bodyText,
    }
  );
  const payload = await upstream.json().catch(() => ({ error: 'Resposta inválida da API.' }));
  return NextResponse.json(payload, { status: upstream.status });
}
