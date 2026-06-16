import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getSession } from '@leedi/auth';
import { env } from '@leedi/config';

/** Same-origin proxy for archiving a product (PATCH, no body). */
function apiBaseUrl(): string {
  return env.BETTER_AUTH_URL.replace(':3000', `:${env.API_PORT}`);
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ tenantId: string; id: string }> }
) {
  const session = await getSession(request.headers);
  if (!session?.user?.id)
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
  const { tenantId, id } = await context.params;
  const upstream = await fetch(
    `${apiBaseUrl()}/api/tenants/${encodeURIComponent(tenantId)}/knowledge/products/${encodeURIComponent(id)}/archive`,
    {
      method: 'PATCH',
      headers: { cookie: request.headers.get('cookie') ?? '' },
    }
  );
  const payload = await upstream.json().catch(() => ({ error: 'Resposta inválida da API.' }));
  return NextResponse.json(payload, { status: upstream.status });
}
