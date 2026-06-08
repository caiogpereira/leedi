import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getSession } from '@leedi/auth';
import { env } from '@leedi/config';

function lifecycleUrl(tenantId: string, id: string, action: string): string {
  const base = env.BETTER_AUTH_URL.replace(':3000', `:${env.API_PORT}`);
  return `${base}/api/tenants/${encodeURIComponent(tenantId)}/campaigns/${encodeURIComponent(id)}/${action}`;
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ tenantId: string; id: string }> }
) {
  const session = await getSession(request.headers);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
  }
  const { tenantId, id } = await context.params;
  const cookieHeader = request.headers.get('cookie') ?? '';
  const upstream = await fetch(lifecycleUrl(tenantId, id, 'activate'), {
    method: 'POST',
    headers: { cookie: cookieHeader, 'content-type': 'application/json' },
  });
  const payload = await upstream.json().catch(() => ({ error: 'Resposta inválida da API.' }));
  return NextResponse.json(payload, { status: upstream.status });
}
