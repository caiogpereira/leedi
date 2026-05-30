import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { hasSessionCookie, getRequiredRoles, type TenantRole } from '@leedi/auth';

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

  // RBAC route gating (Story 2.5). `getRequiredRoles` returns null for
  // unrestricted routes (most of the dashboard) and the allowed roles for
  // owner/admin-only areas like /settings/*. Prefix-matched, so nested routes
  // inherit the requirement.
  const requiredRoles = getRequiredRoles(pathname);
  if (requiredRoles) {
    // FAIL-CLOSED: the caller's per-tenant role is NOT resolvable in the Edge
    // runtime today — that needs a memberships lookup keyed by current_tenant_id,
    // which the optimistic cookie check deliberately avoids (the pg adapter can't
    // run on Edge). So `userRole` is undefined here and restricted routes are
    // denied. This is safe: it's deny-by-default, and no /settings/* pages exist
    // yet to lock out. The authoritative enforcement for restricted routes will
    // live in their Server Components via `getSession` + `hasPermission`.
    // TODO(Story 2.7): resolve the tenant role from the session context once the
    // multi-tenant session token carries (or the Edge can derive) current role,
    // then replace `undefined` below with that value.
    const userRole: TenantRole | undefined = undefined;
    if (!userRole || !requiredRoles.includes(userRole)) {
      return NextResponse.redirect(new URL('/403', request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
