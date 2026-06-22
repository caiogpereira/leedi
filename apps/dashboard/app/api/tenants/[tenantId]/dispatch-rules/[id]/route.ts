import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getSession } from '@leedi/auth';
import { internalApiUrl } from '../../../../../../lib/internal-api-url';

function apiUrl(tenantId: string, id: string): string {
  const base = internalApiUrl();
  return `${base}/api/tenants/${encodeURIComponent(tenantId)}/dispatch-rules/${encodeURIComponent(id)}`;
}

async function forward(
  request: NextRequest,
  tenantId: string,
  id: string,
  method: 'PATCH' | 'DELETE'
) {
  const session = await getSession(request.headers);
  if (!session?.user?.id)
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
  const init: RequestInit = {
    method,
    headers: { cookie: request.headers.get('cookie') ?? '', 'content-type': 'application/json' },
  };
  if (method === 'PATCH') init.body = await request.text();
  const upstream = await fetch(apiUrl(tenantId, id), init);
  if (upstream.status === 204) return new NextResponse(null, { status: 204 });
  const payload = await upstream.json().catch(() => ({ error: 'Resposta inválida da API.' }));
  return NextResponse.json(payload, { status: upstream.status });
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ tenantId: string; id: string }> }
) {
  const { tenantId, id } = await context.params;
  return forward(request, tenantId, id, 'PATCH');
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ tenantId: string; id: string }> }
) {
  const { tenantId, id } = await context.params;
  return forward(request, tenantId, id, 'DELETE');
}
