import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getSession } from '@leedi/auth';
import { internalApiUrl } from '../../../../../../lib/internal-api-url';

/**
 * Same-origin proxy for creating a product (knowledge base).
 *
 * The product form fetches a relative path so the httpOnly session cookie
 * (host-scoped on localhost, shared across ports) rides along. This handler
 * forwards the JSON body + cookie to the Hono API, which re-validates session +
 * tenant membership. API base URL derivation mirrors the other proxies
 * (:3000 → API_PORT).
 */
function apiBaseUrl(): string {
  return internalApiUrl();
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ tenantId: string }> }
) {
  const session = await getSession(request.headers);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
  }

  const { tenantId } = await context.params;
  if (!tenantId) {
    return NextResponse.json({ error: 'Parâmetros ausentes.' }, { status: 400 });
  }

  const bodyText = await request.text();
  const cookieHeader = request.headers.get('cookie') ?? '';

  const upstream = await fetch(
    `${apiBaseUrl()}/api/tenants/${encodeURIComponent(tenantId)}/knowledge/products`,
    {
      method: 'POST',
      headers: { cookie: cookieHeader, 'content-type': 'application/json' },
      body: bodyText,
    }
  );

  const payload = await upstream
    .json()
    .catch(() => ({ error: 'Resposta inválida da API.' }));
  return NextResponse.json(payload, { status: upstream.status });
}
