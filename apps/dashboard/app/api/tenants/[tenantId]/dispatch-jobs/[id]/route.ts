import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getSession } from '@leedi/auth';
import { internalApiUrl } from '../../../../../../lib/internal-api-url';

function apiUrl(tenantId: string, id: string): string {
  const base = internalApiUrl();
  return `${base}/api/tenants/${encodeURIComponent(tenantId)}/dispatch-jobs/${encodeURIComponent(id)}`;
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ tenantId: string; id: string }> }
) {
  const session = await getSession(request.headers);
  if (!session?.user?.id)
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
  const { tenantId, id } = await context.params;
  const upstream = await fetch(apiUrl(tenantId, id), {
    headers: { cookie: request.headers.get('cookie') ?? '', 'content-type': 'application/json' },
  });
  const payload = await upstream.json().catch(() => ({ error: 'Resposta inválida da API.' }));
  return NextResponse.json(payload, { status: upstream.status });
}
