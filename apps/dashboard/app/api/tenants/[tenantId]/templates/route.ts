import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getSession } from '@leedi/auth';
import { internalApiUrl } from '../../../../../lib/internal-api-url';

function apiBaseUrl(): string {
  return internalApiUrl();
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ tenantId: string }> }
) {
  const session = await getSession(request.headers);
  if (!session?.user?.id)
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
  const { tenantId } = await context.params;
  const url = `${apiBaseUrl()}/api/tenants/${encodeURIComponent(tenantId)}/templates${request.nextUrl.search}`;
  const upstream = await fetch(url, {
    headers: { cookie: request.headers.get('cookie') ?? '', 'content-type': 'application/json' },
  });
  const payload = await upstream.json().catch(() => ({ error: 'Resposta inválida da API.' }));
  return NextResponse.json(payload, { status: upstream.status });
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ tenantId: string }> }
) {
  const session = await getSession(request.headers);
  if (!session?.user?.id)
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
  const { tenantId } = await context.params;
  const bodyText = await request.text();
  const upstream = await fetch(
    `${apiBaseUrl()}/api/tenants/${encodeURIComponent(tenantId)}/templates`,
    {
      method: 'POST',
      headers: { cookie: request.headers.get('cookie') ?? '', 'content-type': 'application/json' },
      body: bodyText,
    }
  );
  const payload = await upstream.json().catch(() => ({ error: 'Resposta inválida da API.' }));
  return NextResponse.json(payload, { status: upstream.status });
}
