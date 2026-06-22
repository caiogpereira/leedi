import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getSession } from '@leedi/auth';
import { internalApiUrl } from '../../../../../lib/internal-api-url';

function apiUrl(tenantId: string, path = ''): string {
  const base = internalApiUrl();
  return `${base}/api/tenants/${encodeURIComponent(tenantId)}/segments${path}`;
}

async function forward(
  request: NextRequest,
  tenantId: string,
  method: 'GET' | 'POST',
  path = ''
) {
  const cookieHeader = request.headers.get('cookie') ?? '';
  const url = apiUrl(tenantId, path);
  const search = request.nextUrl.search;
  const init: RequestInit = {
    method,
    headers: { cookie: cookieHeader, 'content-type': 'application/json' },
  };
  if (method === 'POST') {
    init.body = await request.text();
  }
  const upstream = await fetch(method === 'GET' ? `${url}${search}` : url, init);
  const payload = await upstream.json().catch(() => ({ error: 'Resposta inválida da API.' }));
  return NextResponse.json(payload, { status: upstream.status });
}

async function requireSession(request: NextRequest) {
  const session = await getSession(request.headers);
  if (!session?.user?.id) return null;
  return session;
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ tenantId: string }> }
) {
  if (!(await requireSession(request))) {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
  }
  const { tenantId } = await context.params;
  return forward(request, tenantId, 'GET');
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ tenantId: string }> }
) {
  if (!(await requireSession(request))) {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
  }
  const { tenantId } = await context.params;
  return forward(request, tenantId, 'POST');
}
