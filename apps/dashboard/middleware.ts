import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { hasSessionCookie } from '@leedi/auth/edge';

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

  // RBAC route gating is NOT done here. The Edge runtime cannot resolve the
  // caller's per-tenant role — that needs a memberships lookup keyed by the active
  // tenant, and the pg adapter can't run on Edge (the optimistic cookie check
  // deliberately avoids any DB call). Enforcement therefore lives in the restricted
  // Server Components via `requireTenantRouteAccess` (src/lib/tenant-context.ts),
  // where the membership-backed role IS available. `ROUTE_PERMISSION_MAP` remains
  // the single source of truth, consumed there.
  //
  // (Earlier this block hard-coded `userRole = undefined` and 403'd EVERY restricted
  // route — once real /settings/* pages shipped, that locked out every user including
  // owners. Fixed in the Epic 2 code review: gate at the page, not the Edge.)

  // Forward the active tenant (Story 2.7) to Server Components via a request
  // header so they can read it without parsing cookies themselves. This is a
  // routing convenience ONLY — the Edge runtime cannot hit the DB to verify the
  // membership, so the value is attacker-controllable. Every consumer MUST
  // re-validate it against the user's memberships before using it for data
  // access (the dashboard layout does this against `listUserTenants`).
  const requestHeaders = new Headers(request.headers);
  const tenantCookie = request.cookies.get('leedi_tenant');
  if (tenantCookie?.value) {
    requestHeaders.set('x-leedi-tenant-id', tenantCookie.value);
  } else {
    // Strip any client-injected header so it can never be spoofed without the cookie.
    requestHeaders.delete('x-leedi-tenant-id');
  }

  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
