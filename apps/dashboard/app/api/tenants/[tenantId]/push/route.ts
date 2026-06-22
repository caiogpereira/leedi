import type { NextRequest } from 'next/server';
import { internalApiUrl } from '../../../../../lib/internal-api-url';

function apiBaseUrl(): string {
  return internalApiUrl();
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ tenantId: string }> }) {
  const { tenantId } = await params;
  const cookieHeader = request.headers.get('cookie') ?? '';
  const upstream = await fetch(
    `${apiBaseUrl()}/api/tenants/${encodeURIComponent(tenantId)}/push/subscribe`,
    {
      method: 'POST',
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

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ tenantId: string }> }) {
  const { tenantId } = await params;
  const cookieHeader = request.headers.get('cookie') ?? '';
  const upstream = await fetch(
    `${apiBaseUrl()}/api/tenants/${encodeURIComponent(tenantId)}/push/subscribe`,
    {
      method: 'DELETE',
      headers: { cookie: cookieHeader, 'content-type': 'application/json' },
      body: await request.text(),
    }
  );
  return new Response(null, { status: upstream.status });
}
