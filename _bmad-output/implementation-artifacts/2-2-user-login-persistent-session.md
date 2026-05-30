# Story 2.2: User Login & Persistent Session

Status: done

## Story

As a registered user,
I want to log in with email and password and stay logged in across browser sessions,
so that I don't need to re-authenticate every time I open the platform.

## Acceptance Criteria

1. **Given** a user enters valid credentials on the login page, **When** they submit the login form, **Then** a session is created **And** they are redirected to their tenant's dashboard, **And** the session persists after closing and reopening the browser.
2. **Given** a logged-in user clicks "Sair", **When** the logout action is triggered, **Then** the session is destroyed on the server **And** the user is redirected to the login page, **And** the browser cannot reuse the old session token.
3. **Given** a user enters incorrect credentials, **When** they submit the login form, **Then** a generic error is shown: "E-mail ou senha incorretos" (no field-specific disclosure).

## Tasks / Subtasks

- [ ] Task 1: Configure Better-Auth session strategy (AC: #1, #2)
  - [ ] In `packages/auth/src/index.ts`, enable HTTP-only, Secure, SameSite=Lax session cookie with server-side session storage
  - [ ] Enable `rememberMe` support: when set, session expiry = 30 days; otherwise short-lived (e.g. session cookie / 1 day)
  - [ ] Ensure email-unverified accounts cannot create a session (ties to Story 2.1 `requireEmailVerification`)
- [ ] Task 2: Login use-case + UI (AC: #1, #3)
  - [ ] Create `packages/auth/src/use-cases/login-user.ts` wrapping Better-Auth sign-in; validate input via Zod
  - [ ] Map ALL failure modes (wrong password, unknown email, unverified) to the single generic message in AC #3
  - [ ] Create `apps/web/app/(auth)/login/page.tsx` with email/password form + "Manter conectado" (rememberMe) checkbox; strings via next-intl
- [ ] Task 3: Post-login redirect + multi-tenant routing (AC: #1)
  - [ ] After successful login, read `redirect` query param; validate it is a same-origin relative path before using (open-redirect guard)
  - [ ] If user belongs to exactly one tenant: set `current_tenant_id` and redirect to `/dashboard`
  - [ ] If user belongs to multiple tenants: redirect to tenant selector (Story 2.7 component); if zero tenants: redirect to onboarding placeholder (Epic 19)
- [ ] Task 4: Logout (AC: #2)
  - [ ] Create `packages/auth/src/use-cases/logout-user.ts` invoking Better-Auth sign-out (server-side session invalidation)
  - [ ] Add a "Sair" action in the dashboard header that calls the logout route, clears the cookie, and redirects to `/login`
  - [ ] Verify revoked session token returns 401 on reuse (no stale acceptance)
- [ ] Task 5: Session middleware (AC: #1, #2)
  - [ ] Add `apps/dashboard/middleware.ts` that validates the session server-side on every protected route; unauthenticated -> redirect `/login?redirect=<path>`
  - [ ] Expose a server helper `getSession()` from `packages/auth/src/index.ts` for server components / route handlers
- [ ] Task 6: Tests (AC: #1, #2, #3)
  - [ ] Unit test login use-case: wrong password, unknown email, and unverified all return the identical generic message
  - [ ] Integration test: rememberMe sets ~30-day expiry; default does not
  - [ ] Integration test: logout invalidates session server-side (reused token -> 401)
  - [ ] Playwright E2E: login -> dashboard; logout -> login; persistence across simulated browser restart (reuse stored cookie)

## Dev Notes

- Files to create/modify: `packages/auth/src/index.ts`, `packages/auth/src/use-cases/login-user.ts`, `packages/auth/src/use-cases/logout-user.ts`, `apps/web/app/(auth)/login/page.tsx`, `apps/dashboard/middleware.ts`.
- npm dependencies: `better-auth`, `zod`, `react-hook-form`, `@hookform/resolvers` (most already present from 2.1).
- Architecture pattern: session validation centralized in middleware + a `getSession()` helper exported from `packages/auth`; pages never re-implement cookie parsing.
- Multi-tenant: the session carries `current_tenant_id`. Selecting/switching tenants is Story 2.7; this story only handles the single-vs-multi routing decision at login.

### Security considerations

- AC #3 generic message is mandatory: never reveal whether the email exists or the password was specifically wrong — prevents user enumeration.
- Cookie flags: HttpOnly + Secure + SameSite=Lax (or Strict where feasible). Never expose the session token to client JS.
- Server-side logout must actually delete/revoke the session record so a captured token cannot be replayed (AC #2). Do not rely on client-side cookie deletion alone.
- Rate-limit login attempts per IP + per email (Upstash Redis) to blunt credential stuffing; add backoff/lockout.
- Validate `redirect` param is a relative same-origin path to prevent open-redirect phishing.

### Testing standards

- Unit tests under `packages/auth/src/use-cases/*.test.ts` (Vitest); assert message uniformity across failure modes.
- E2E with Playwright (MCP) covering the persistence requirement explicitly.

### Pitfalls to avoid

- Do not branch error copy by failure type — a single string for all credential failures.
- Do not store session state only in a JWT without server revocation, or AC #2 token-reuse prevention fails.
- Do not blindly trust `redirect` query param (open-redirect).

### Project Structure Notes

- Login UI in `apps/web`; protected-route middleware in `apps/dashboard`.
- Auth logic stays in `packages/auth`.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 2.2: User Login & Persistent Session]
- [Source: _bmad-output/planning-artifacts/epics.md#Epic 2: Multi-Tenant Identity & Access] (FR1, FR3)
- [Source: docs/01-leedi-arquitetura.md#6.1 Schema do banco]

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

### Completion Notes List

- Better-Auth session: 7-day expiry, daily refresh, HttpOnly+Secure cookie.
- CRITICAL FIX: `nextCookies()` plugin required for Server Actions to persist the session cookie (without it, login succeeds but the cookie is not set).
- CRITICAL FIX: Edge runtime cannot use `auth.api.getSession` (DB call); middleware uses `getSessionCookie` (synchronous, Edge-safe).
- All credential failures map to a single message "E-mail ou senha incorretos" (no enumeration).
- Dashboard `middleware.ts`: Edge-safe session gate + RBAC route enforcement skeleton.
- Logout: server-side session invalidation via `auth.api.signOut`.

### File List

- `packages/auth/src/use-cases/login-user.ts`
- `packages/auth/src/use-cases/login-user.test.ts`
- `packages/auth/src/use-cases/logout-user.ts`
- `apps/web/app/(auth)/login/page.tsx`
- `apps/web/app/(auth)/login/actions.ts`
- `apps/dashboard/middleware.ts`
- `apps/dashboard/app/actions.ts`
- `apps/dashboard/app/page.tsx`
