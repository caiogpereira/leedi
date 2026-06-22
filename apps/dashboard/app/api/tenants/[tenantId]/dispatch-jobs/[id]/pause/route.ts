import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getSession } from '@leedi/auth';
import { internalApiUrl } from '../../../../../../../lib/internal-api-url';

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ tenantId: string; id: string }> }
) {
  const session = await getSession(request.headers);
  if (!session?.user?.id)
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
  const { tenantId, id } = await context.params;
  const base = internalApiUrl();
  const url = `${base}/api/tenants/${encodeURIComponent(tenantId)}/dispatch-jobs/${encodeURIComponent(id)}/pause`;
  const upstream = await fetch(url, {
    method: 'POST',
    headers: { cookie: request.headers.get('cookie') ?? '', 'content-type': 'application/json' },
  });
  const payload = await upstream.json().catch(() => ({ error: 'Resposta inválida da API.' }));
  return NextResponse.json(payload, { status: upstream.status });
}
