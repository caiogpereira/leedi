import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { hasSessionCookie } from '@leedi/auth';

// Routes that don't require authentication.
const PUBLIC_PATHS = ['/api/health'];

// Login lives on the web app (port 3000), not the dashboard.
// TODO: derive this from env (e.g. NEXT_PUBLIC_WEB_URL) once multi-origin config
// is wired up. Hardcoded for the current local/same-origin setup.
const LOGIN_ORIGIN = 'http://localhost:3000';

/**
 * Edge middleware that gates the protected dashboard.
 *
 * It performs an OPTIMISTIC cookie-presence check only — no DB call — because
 * middleware runs in the Edge runtime where the Drizzle/pg adapter cannot run.
 * Full session validation happens server-side (Server Components / Route
 * Handlers) via `getSession`. A spoofed/expired cookie that passes this gate is
 * still rejected there, so this is safe as a routing guard (AC#1).
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow public paths.
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  if (!hasSessionCookie(request)) {
    const loginUrl = new URL('/login', LOGIN_ORIGIN);
    // `pathname` is the current same-origin request path (not user input), so it
    // is safe to echo back. The consumer of this param (the login flow) must
    // still validate it against an internal-path allowlist before redirecting.
    loginUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
