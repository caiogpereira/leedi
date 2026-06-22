import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getSession } from '@leedi/auth';
import { internalApiUrl } from '../../../../../../lib/internal-api-url';

function apiUrl(tenantId: string): string {
  const base = internalApiUrl();
  return `${base}/api/tenants/${encodeURIComponent(tenantId)}/analytics/sales`;
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ tenantId: string }> }
) {
  const session = await getSession(request.headers);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
  }
  const { tenantId } = await context.params;
  const cookieHeader = request.headers.get('cookie') ?? '';
  const upstream = await fetch(`${apiUrl(tenantId)}${request.nextUrl.search}`, {
    headers: { cookie: cookieHeader },
  });
  const payload = await upstream.json().catch(() => ({ error: 'Resposta inválida da API.' }));
  return NextResponse.json(payload, { status: upstream.status });
}
