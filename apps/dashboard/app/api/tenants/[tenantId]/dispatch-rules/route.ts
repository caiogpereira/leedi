import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getSession } from '@leedi/auth';
import { internalApiUrl } from '../../../../../lib/internal-api-url';

function apiUrl(tenantId: string): string {
  const base = internalApiUrl();
  return `${base}/api/tenants/${encodeURIComponent(tenantId)}/dispatch-rules`;
}

async function requireSession(request: NextRequest) {
  const session = await getSession(request.headers);
  return session?.user?.id ? session : null;
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ tenantId: string }> }
) {
  if (!(await requireSession(request)))
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
  const { tenantId } = await context.params;
  const upstream = await fetch(apiUrl(tenantId), {
    headers: { cookie: request.headers.get('cookie') ?? '', 'content-type': 'application/json' },
  });
  const payload = await upstream.json().catch(() => ({ error: 'Resposta inválida da API.' }));
  return NextResponse.json(payload, { status: upstream.status });
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ tenantId: string }> }
) {
  if (!(await requireSession(request)))
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
  const { tenantId } = await context.params;
  const upstream = await fetch(apiUrl(tenantId), {
    method: 'POST',
    headers: { cookie: request.headers.get('cookie') ?? '', 'content-type': 'application/json' },
    body: await request.text(),
  });
  const payload = await upstream.json().catch(() => ({ error: 'Resposta inválida da API.' }));
  return NextResponse.json(payload, { status: upstream.status });
}
