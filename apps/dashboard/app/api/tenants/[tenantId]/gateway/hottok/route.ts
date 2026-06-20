import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getSession } from '@leedi/auth';
import { env } from '@leedi/config';

function apiUrl(tenantId: string): string {
  const base = env.BETTER_AUTH_URL.replace(':3000', `:${env.API_PORT}`);
  return `${base}/api/tenants/${encodeURIComponent(tenantId)}/onboarding/hottok`;
}

async function forward(request: NextRequest, tenantId: string, method: 'GET' | 'PUT') {
  const cookieHeader = request.headers.get('cookie') ?? '';
  const url = apiUrl(tenantId);
  const init: RequestInit = {
    method,
    headers: { cookie: cookieHeader, 'content-type': 'application/json' },
  };
  if (method === 'PUT') {
    init.body = await request.text();
  }
  const upstream = await fetch(url, init);
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

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ tenantId: string }> }
) {
  if (!(await requireSession(request))) {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
  }
  const { tenantId } = await context.params;
  return forward(request, tenantId, 'PUT');
}
