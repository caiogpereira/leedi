import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getSession } from '@leedi/auth';
import { env } from '@leedi/config';

// Read-only proxy for the current WhatsApp connection (token-free) — used by the
// dispatch list to know whether quality has recovered enough to resume jobs.
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ tenantId: string }> }
) {
  const session = await getSession(request.headers);
  if (!session?.user?.id)
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
  const { tenantId } = await context.params;
  const base = env.BETTER_AUTH_URL.replace(':3000', `:${env.API_PORT}`);
  const url = `${base}/api/tenants/${encodeURIComponent(tenantId)}/whatsapp`;
  const upstream = await fetch(url, {
    method: 'GET',
    headers: { cookie: request.headers.get('cookie') ?? '' },
  });
  const payload = await upstream.json().catch(() => ({ connection: null }));
  return NextResponse.json(payload, { status: upstream.status });
}
