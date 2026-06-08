import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getSession } from '@leedi/auth';
import { env } from '@leedi/config';

/**
 * Same-origin proxy for the agent configuration panel (Story 7.1).
 *
 * Forwards GET/PATCH to the Hono API at /api/tenants/:tenantId/agent-config, passing
 * the session cookie so the API's requireTenantSession middleware can authorize.
 * GET triggers the default upsert (AC#2); PATCH persists field updates (AC#3).
 */
function apiBaseUrl(): string {
  return env.BETTER_AUTH_URL.replace(':3000', `:${env.API_PORT}`);
}

async function forward(request: NextRequest, tenantId: string, method: 'GET' | 'PATCH') {
  const cookieHeader = request.headers.get('cookie') ?? '';
  const init: RequestInit = {
    method,
    headers: { cookie: cookieHeader, 'content-type': 'application/json' },
  };
  if (method === 'PATCH') {
    init.body = await request.text();
  }

  const upstream = await fetch(
    `${apiBaseUrl()}/api/tenants/${encodeURIComponent(tenantId)}/agent-config`,
    init
  );

  const payload = await upstream
    .json()
    .catch(() => ({ error: 'Resposta inválida da API.' }));
  return NextResponse.json(payload, { status: upstream.status });
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
  if (!tenantId) {
    return NextResponse.json({ error: 'Parâmetro ausente.' }, { status: 400 });
  }
  return forward(request, tenantId, 'GET');
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ tenantId: string }> }
) {
  const session = await getSession(request.headers);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
  }
  const { tenantId } = await context.params;
  if (!tenantId) {
    return NextResponse.json({ error: 'Parâmetro ausente.' }, { status: 400 });
  }
  return forward(request, tenantId, 'PATCH');
}
