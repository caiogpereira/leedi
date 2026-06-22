import type { NextRequest } from 'next/server';
import { internalApiUrl } from '../../../../../lib/internal-api-url';

function apiBaseUrl(): string {
  return internalApiUrl();
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tenantId: string }> }
) {
  const { tenantId } = await params;
  const cookieHeader = request.headers.get('cookie') ?? '';
  const upstream = await fetch(
    `${apiBaseUrl()}/api/tenants/${encodeURIComponent(tenantId)}/notification-preferences`,
    { method: 'GET', headers: { cookie: cookieHeader } }
  );
  const body = await upstream.text();
  return new Response(body, {
    status: upstream.status,
    headers: { 'content-type': 'application/json' },
  });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ tenantId: string }> }
) {
  const { tenantId } = await params;
  const cookieHeader = request.headers.get('cookie') ?? '';
  const upstream = await fetch(
    `${apiBaseUrl()}/api/tenants/${encodeURIComponent(tenantId)}/notification-preferences`,
    {
      method: 'PATCH',
      headers: { cookie: cookieHeader, 'content-type': 'application/json' },
      body: await request.text(),
    }
  );
  const body = await upstream.text();
  return new Response(body, {
    status: upstream.status,
    headers: { 'content-type': 'application/json' },
  });
}
