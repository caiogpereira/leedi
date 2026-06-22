import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getSession } from '@leedi/auth';
import { internalApiUrl } from '../../../../../../../lib/internal-api-url';

/** Same-origin proxy for submitting a template to Meta for approval (POST, no body). */
function apiBaseUrl(): string {
  return internalApiUrl();
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ tenantId: string; id: string }> }
) {
  const session = await getSession(request.headers);
  if (!session?.user?.id)
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
  const { tenantId, id } = await context.params;
  const upstream = await fetch(
    `${apiBaseUrl()}/api/tenants/${encodeURIComponent(tenantId)}/templates/${encodeURIComponent(id)}/submit`,
    {
      method: 'POST',
      headers: { cookie: request.headers.get('cookie') ?? '' },
    }
  );
  const payload = await upstream.json().catch(() => ({ error: 'Resposta inválida da API.' }));
  return NextResponse.json(payload, { status: upstream.status });
}
