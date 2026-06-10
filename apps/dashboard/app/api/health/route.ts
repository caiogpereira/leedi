import { NextResponse } from 'next/server';

/**
 * Liveness probe. Listed in `middleware.ts` PUBLIC_PATHS so it is reachable
 * without a session — used by the Playwright E2E harness as the dev-server
 * readiness signal and available for uptime checks.
 */
export const dynamic = 'force-dynamic';

export function GET() {
  return NextResponse.json({ status: 'ok' });
}
