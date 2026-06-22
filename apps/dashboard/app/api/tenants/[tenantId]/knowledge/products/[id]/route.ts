import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getSession } from '@leedi/auth';
import { internalApiUrl } from '../../../../../../../lib/internal-api-url';

/** Same-origin proxy for editing (PATCH) a product's core fields. */
function apiBaseUrl(): string {
  return internalApiUrl();
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ tenantId: string; id: string }> }
) {
  const session = await getSession(request.headers);
  if (!session?.user?.id)
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
  const { tenantId, id } = await context.params;
  const bodyText = await request.text();
  const upstream = await fetch(
    `${apiBaseUrl()}/api/tenants/${encodeURIComponent(tenantId)}/knowledge/products/${encodeURIComponent(id)}`,
    {
      method: 'PATCH',
      headers: { cookie: request.headers.get('cookie') ?? '', 'content-type': 'application/json' },
      body: bodyText,
    }
  );
  const payload = await upstream.json().catch(() => ({ error: 'Resposta inválida da API.' }));
  return NextResponse.json(payload, { status: upstream.status });
}
