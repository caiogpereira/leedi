import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getSession } from '@leedi/auth';
import { internalApiUrl } from '../../../../../../../lib/internal-api-url';

/** Same-origin proxy for editing (PATCH) and soft-deleting (DELETE) a knowledge-base entry. */
function apiBaseUrl(): string {
  return internalApiUrl();
}

function upstreamUrl(tenantId: string, id: string): string {
  return `${apiBaseUrl()}/api/tenants/${encodeURIComponent(tenantId)}/knowledge/knowledge-base/${encodeURIComponent(id)}`;
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
  const upstream = await fetch(upstreamUrl(tenantId, id), {
    method: 'PATCH',
    headers: { cookie: request.headers.get('cookie') ?? '', 'content-type': 'application/json' },
    body: bodyText,
  });
  const payload = await upstream.json().catch(() => ({ error: 'Resposta inválida da API.' }));
  return NextResponse.json(payload, { status: upstream.status });
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ tenantId: string; id: string }> }
) {
  const session = await getSession(request.headers);
  if (!session?.user?.id)
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
  const { tenantId, id } = await context.params;
  const upstream = await fetch(upstreamUrl(tenantId, id), {
    method: 'DELETE',
    headers: { cookie: request.headers.get('cookie') ?? '' },
  });
  // The API soft-deletes and returns 204 (empty body) — mirror it without
  // attempting to parse JSON (which would yield a spurious error payload).
  if (upstream.status === 204) return new NextResponse(null, { status: 204 });
  const payload = await upstream.json().catch(() => ({ error: 'Resposta inválida da API.' }));
  return NextResponse.json(payload, { status: upstream.status });
}
