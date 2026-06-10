# Story 2.1: User Registration & Email Verification

Status: done

## Story

As a new user,
I want to register with my email and password,
so that I can access the Leedi platform.

## Acceptance Criteria

1. **Given** a user submits a valid email and password on the registration form, **When** the form is submitted, **Then** a new user account is created via Better-Auth **And** a verification email is sent via Resend, **And** the user sees a confirmation screen instructing them to check their email.
2. **Given** a user clicks the verification link in the email, **When** the link is valid and not expired, **Then** the user's email is marked as verified (`users.email_verified = true`) **And** they are redirected to the dashboard login.
3. **Given** a user attempts to register with an already-registered email, **When** the form is submitted, **Then** an error message is shown: "Este e-mail já está cadastrado. Faça login ou recupere sua senha." **And** no second account is created.

## Tasks / Subtasks

- [ ] Task 1: Configure Better-Auth email/password provider (AC: #1, #2)
  - [ ] In `packages/auth/src/index.ts`, enable the `emailAndPassword` provider with `requireEmailVerification: true` and `autoSignIn: false`
  - [ ] Configure password hashing (Better-Auth default `scrypt`); never store or log plaintext
  - [ ] Wire `customUser: true` so Better-Auth uses the `users` table from `packages/db` (depends on Story 2.4 schema; if 2.4 not merged, coordinate ordering)
  - [ ] Set `emailVerification.sendVerificationEmail` callback to dispatch via Resend (Task 3)
  - [ ] Export the configured `auth` instance and inferred types as the ONLY public surface of `packages/auth/src/index.ts`
- [ ] Task 2: Implement registration use-case (AC: #1, #3)
  - [ ] Create `packages/auth/src/use-cases/register-user.ts` wrapping Better-Auth sign-up; validate input with a Zod schema (email format, password policy)
  - [ ] Password policy: min 8 chars, >= 1 uppercase, >= 1 number — enforce in a shared Zod schema `packages/auth/src/schemas/password.ts`
  - [ ] On duplicate email, map Better-Auth's error to the pt-BR message in AC #3 (do NOT leak whether account exists beyond this explicit product copy)
- [ ] Task 3: Resend verification email (AC: #1)
  - [ ] Add Resend client adapter in `packages/notification/src/adapters/resend.ts` (or reuse if it exists from Epic 1); expose a `sendEmail` port
  - [ ] Create React Email template `apps/web/emails/email-verification.tsx` with verification CTA button + pt-BR copy
  - [ ] Render template and send through Resend in the `sendVerificationEmail` callback; include the Better-Auth verification URL token
- [ ] Task 4: Registration UI (AC: #1, #3)
  - [ ] Create `apps/web/app/(auth)/register/page.tsx` with form (email, password, confirm password) using shadcn/ui + react-hook-form + Zod resolver
  - [ ] All strings via next-intl message keys (pt-BR), no hardcoded UI text
  - [ ] On success, render confirmation screen: "Verifique seu e-mail para ativar sua conta."
  - [ ] On duplicate-email error, surface AC #3 message at form level (not field-level)
- [ ] Task 5: Verification callback route (AC: #2)
  - [ ] Confirm Better-Auth's verify endpoint marks `email_verified = true`; add a thin `apps/web/app/(auth)/verify/route.ts` or rely on Better-Auth handler
  - [ ] On valid token, redirect to `/login` (dashboard login); on expired/invalid token, show pt-BR error and a "reenviar verificação" option
- [ ] Task 6: Tests (AC: #1, #2, #3)
  - [ ] Unit test the register use-case: valid input creates user; weak password rejected; duplicate email returns mapped message
  - [ ] Unit test password Zod schema boundary cases (7 chars, no uppercase, no number)
  - [ ] Integration test: register -> verification token -> email_verified flips to true
  - [ ] Playwright E2E: happy path registration -> confirmation screen

## Dev Notes

- Files to create/modify: `packages/auth/src/index.ts`, `packages/auth/src/use-cases/register-user.ts`, `packages/auth/src/schemas/password.ts`, `packages/notification/src/adapters/resend.ts`, `apps/web/emails/email-verification.tsx`, `apps/web/app/(auth)/register/page.tsx`, `apps/web/app/(auth)/verify/route.ts`.
- npm dependencies: `better-auth`, `resend`, `@react-email/components`, `react-email`, `zod`, `react-hook-form`, `@hookform/resolvers`. `next-intl` and `shadcn/ui` assumed installed from Epic 1.
- Architecture pattern: the route/page calls a use-case in `packages/auth/src/use-cases/`; no Better-Auth or DB calls inline in the page (Architecture: every write goes through a use-case). `packages/auth/src/index.ts` is the only public export of the package.
- Better-Auth integrates with the `users` table from Story 2.4; `password_hash` lives there. Treat 2.4 as a dependency for full integration (the schema must exist before sign-up can persist).
- After registration the user has no tenant yet — onboarding/tenant creation is Epic 19. This story stops at a verified user account.

### Security considerations

- NEVER log or return `password_hash`, plaintext passwords, or verification tokens. Scrub them from Sentry breadcrumbs and structured logs.
- Verification token must be single-use and time-limited (Better-Auth default expiry; keep <= 24h).
- The duplicate-email message in AC #3 is an explicit product decision that trades a small enumeration signal for UX. Do NOT extend this disclosure to login (2.2) or password reset (2.3), which must stay generic.
- Rate-limit the registration and resend-verification endpoints (Upstash Redis) to prevent email-bombing and enumeration probing.

### Testing standards

- Unit tests colocated under `packages/auth/src/use-cases/*.test.ts` (Vitest).
- RLS not relevant here (pre-tenant); integration test uses a throwaway test DB.
- Assert that no test logs contain hash/token substrings.

### Pitfalls to avoid

- Do not set `autoSignIn: true` — users must verify before a session is granted, otherwise AC #2's redirect-to-login is bypassed.
- Do not hardcode pt-BR strings in the page; route them through next-intl.
- Do not couple the Resend adapter to `packages/auth` internals — go through the notification port.

### Project Structure Notes

- Registration UI lives in `apps/web` (public/auth surface), not `apps/dashboard`.
- Auth business logic lives in `packages/auth`; email delivery in `packages/notification`.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 2.1: User Registration & Email Verification]
- [Source: docs/01-leedi-arquitetura.md#6.1 Schema do banco]
- [Source: _bmad-output/planning-artifacts/epics.md#Epic 2: Multi-Tenant Identity & Access] (FR1)

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

### Completion Notes List

- Better-Auth `emailAndPassword` configured with `requireEmailVerification: true`, `autoSignIn: false`.
- Password policy (min 8, 1 uppercase, 1 number) in `packages/auth/src/schemas/password.ts`.
- `register-user.ts` use-case maps duplicate email to the exact AC#3 pt-BR message.
- React Email templates via `packages/notification` (Resend adapter + template renderer).
- `apps/web` registration page uses `useActionState` + Server Action.
- Better-Auth route handler at `apps/web/app/api/auth/[...all]/route.ts`.
- Migration `0001` created auth tables (`accounts`, `sessions`, `verifications`) and made `users.password_hash` nullable.

### File List

- `packages/auth/src/auth.ts`
- `packages/auth/src/index.ts`
- `packages/auth/src/schemas/password.ts`
- `packages/auth/src/schemas/password.test.ts`
- `packages/auth/src/use-cases/register-user.ts`
- `packages/auth/src/email-senders.ts`
- `packages/notification/src/adapters/resend.ts`
- `packages/notification/src/template-renderer.tsx`
- `packages/notification/src/templates/email-verification.tsx`
- `packages/notification/src/index.ts`
- `apps/web/app/(auth)/register/page.tsx`
- `apps/web/app/(auth)/register/actions.ts`
- `apps/web/app/api/auth/[...all]/route.ts`
- `apps/web/messages/pt-BR.json`
- `packages/db/migrations/0001_striped_purifiers.sql`

## Code Review Follow-up (2026-06-08)

Re-verified against HEAD (see `epic-2-code-review-report.md`). Both 2026-06-04 `[Patch]` items are
**FIXED**: `auth.ts` now sets `minPasswordLength: 8` + a `hooks.before` complexity policy guarding the
native Better-Auth endpoints, and `register-user.test.ts` exists. The `[Decision]` (duplicate-email
enumeration message) was **KEPT** by product decision (Caio, 2026-06-08): it is mandated by AC#3 and
must NOT be extended to login (2.2) / reset (2.3), which stay generic.

## Review Findings (Code Review 2026-06-04)

- [ ] [Review][Decision] Registration leaks account existence — `registerUser` returns a distinct `DUPLICATE_EMAIL_MESSAGE` (enumeration vector), but Story 2.1 AC#3 explicitly mandates this friendly message. Conflicts with the generic anti-enumeration responses used by login (2.2) and forgot-password (2.3). Decide: keep spec'd message vs. switch to generic. [packages/auth/src/use-cases/register-user.ts:15-16,72-73]
- [ ] [Review][Patch] Password policy bypassable via native Better-Auth endpoints — `passwordSchema` (8+/uppercase/digit) is enforced only in the `registerUser` wrapper; the catch-all `/api/auth/[...all]` exposes `sign-up/email` directly with no `minPasswordLength`/complexity in `emailAndPassword` config. Fix: set `minPasswordLength: 8` + a sign-up `before` hook for complexity (config flag alone does not cover complexity in Better-Auth). [packages/auth/src/auth.ts:40-58]
- [ ] [Review][Patch] Missing mandated unit test (Task 6): `register-user.test.ts` — valid input creates user; weak password rejected; duplicate email returns mapped message. [packages/auth/src/use-cases/register-user.ts]
