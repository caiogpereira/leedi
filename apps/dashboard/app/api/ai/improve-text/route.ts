import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { getSession } from '@leedi/auth';
import { internalApiUrl } from '../../../../lib/internal-api-url';

/**
 * Same-origin proxy for the AI text-improvement endpoint used by AIAssistedTextarea
 * (the ✨ button — Story 3.3, consumed by 6.x knowledge pages and Story 7.1's agent
 * config panel). Forwards POST { text, context } to the Hono API and STREAMS the
 * plaintext suggestion back unchanged so the component can render tokens progressively.
 */
function apiBaseUrl(): string {
  return internalApiUrl();
}

export async function POST(request: NextRequest) {
  const session = await getSession(request.headers);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
  }

  const bodyText = await request.text();

  const upstream = await fetch(`${apiBaseUrl()}/api/ai/improve-text`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      cookie: request.headers.get('cookie') ?? '',
      // Preserve the client IP so the API's per-IP rate limit is meaningful.
      'x-forwarded-for': request.headers.get('x-forwarded-for') ?? '',
    },
    body: bodyText,
  });

  // Errors come back as JSON; success comes back as a plaintext stream. Stream the
  // body through untouched and mirror status + content-type.
  return new Response(upstream.body, {
    status: upstream.status,
    headers: {
      'content-type': upstream.headers.get('content-type') ?? 'text/plain; charset=utf-8',
      'cache-control': 'no-cache',
    },
  });
}
