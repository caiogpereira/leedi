# Story 2.3: Password Recovery via Email

Status: done

## Story

As a user who forgot their password,
I want to receive a password reset link by email,
so that I can regain access to my account.

## Acceptance Criteria

1. **Given** a user submits their email on the forgot password page, **When** the email matches a registered account, **Then** a password reset email is sent via Resend with a time-limited link (60 minutes), **And** a success message is shown regardless of whether the email exists (prevents enumeration).
2. **Given** a user clicks a valid non-expired reset link and submits a new password, **When** the password is updated, **Then** all existing sessions are invalidated **And** they are redirected to login with a success message.
3. **Given** a user clicks an expired reset link, **When** they visit the URL, **Then** an error page shows: "Este link expirou. Solicite um novo link de recuperação."

## Tasks / Subtasks

- [ ] Task 1: Configure Better-Auth password reset (AC: #1, #2)
  - [ ] In `packages/auth/src/index.ts`, enable `sendResetPassword` callback (dispatch via Resend) with token expiry = 60 minutes
  - [ ] Ensure reset token is single-use (invalidated after a successful reset)
- [ ] Task 2: Forgot-password use-case + UI (AC: #1)
  - [ ] Create `packages/auth/src/use-cases/request-password-reset.ts`; validate email via Zod
  - [ ] ALWAYS return success to the caller regardless of whether the email exists (no enumeration); only actually send the email when the account exists
  - [ ] Create `apps/web/app/(auth)/forgot-password/page.tsx`; on submit show: "Se este e-mail estiver cadastrado, enviamos um link de recuperação." (strings via next-intl)
- [ ] Task 3: Reset email template (AC: #1)
  - [ ] Create React Email template `apps/web/emails/password-reset.tsx` with reset CTA + 60-min validity note (pt-BR)
  - [ ] Render and send via the Resend adapter in `packages/notification`
- [ ] Task 4: Reset-password use-case + UI (AC: #2, #3)
  - [ ] Create `packages/auth/src/use-cases/reset-password.ts` that verifies token, enforces password policy (min 8, >=1 uppercase, >=1 number — reuse `packages/auth/src/schemas/password.ts`), updates the hash, and invalidates ALL sessions for that user
  - [ ] Create `apps/web/app/(auth)/reset-password/[token]/page.tsx` with new-password + confirm fields
  - [ ] On success: redirect to `/login` with a success flash message
  - [ ] On expired/invalid/used token: render AC #3 error page with a link back to forgot-password
- [ ] Task 5: Tests (AC: #1, #2, #3)
  - [ ] Unit test request-password-reset: response is identical for existing vs non-existing email; email send invoked only when account exists
  - [ ] Unit test reset-password: valid token updates hash; expired token rejected; reused token rejected
  - [ ] Integration test: after reset, previously active sessions are all invalidated (old token -> 401)
  - [ ] Playwright E2E: forgot -> (mock) token -> reset -> login with new password

## Dev Notes

- Files to create/modify: `packages/auth/src/index.ts`, `packages/auth/src/use-cases/request-password-reset.ts`, `packages/auth/src/use-cases/reset-password.ts`, `apps/web/emails/password-reset.tsx`, `apps/web/app/(auth)/forgot-password/page.tsx`, `apps/web/app/(auth)/reset-password/[token]/page.tsx`.
- npm dependencies: `better-auth`, `resend`, `@react-email/components`, `zod` (already present from 2.1/2.2).
- Architecture pattern: token verification + hash update + session invalidation all flow through the reset-password use-case; the page only renders form state and outcomes.

### Security considerations

- Enumeration prevention (AC #1) is mandatory: the success response and timing should not differ between existing and non-existing emails. Consider sending into a queue so response timing is constant.
- Reset token: 60-minute expiry, single-use, cryptographically random, never logged. Invalidate after first successful use.
- Invalidate ALL of the user's sessions on password change (AC #2) — a reset is also the remediation path for account compromise.
- Rate-limit reset requests per email + per IP (Upstash Redis) to prevent email-bombing and token-guessing.
- Never include the password hash or token value in logs, Sentry, or any API response body.

### Testing standards

- Unit tests under `packages/auth/src/use-cases/*.test.ts` (Vitest); explicitly assert identical responses for existing/non-existing email.
- Integration test must confirm global session invalidation.

### Pitfalls to avoid

- Do not reveal email existence via different messages, status codes, or response timing.
- Do not allow a used token to be replayed (mark consumed atomically).
- Do not skip session invalidation — leaving old sessions alive defeats the purpose of a reset.

### Project Structure Notes

- Reset/forgot UI in `apps/web` (unauthenticated surface).
- Logic in `packages/auth`; email delivery in `packages/notification`.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 2.3: Password Recovery via Email]
- [Source: _bmad-output/planning-artifacts/epics.md#Epic 2: Multi-Tenant Identity & Access] (FR2)
- [Source: docs/01-leedi-arquitetura.md#6.1 Schema do banco]

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

### Completion Notes List

- Better-Auth `resetPasswordTokenExpiresIn: 3600` (60 min) + `revokeSessionsOnPasswordReset: true` (critical for AC#2).
- Anti-enumeration: `forgotPasswordAction` always returns `submitted: true` regardless of email existence.
- CORRECTION: Better-Auth API is `auth.api.requestPasswordReset` (not `forgetPassword` as in the original spec).
- CORRECTION: Reset flow uses query params (`?token=` or `?error=INVALID_TOKEN`), not a `[token]` path segment.
- All existing sessions invalidated after a successful reset (`revokeSessionsOnPasswordReset`).

### File List

- `packages/auth/src/use-cases/request-password-reset.ts`
- `packages/auth/src/use-cases/reset-password.ts`
- `packages/auth/src/use-cases/reset-password.test.ts`
- `packages/notification/src/templates/password-reset.tsx`
- `apps/web/app/(auth)/forgot-password/page.tsx`
- `apps/web/app/(auth)/forgot-password/actions.ts`
- `apps/web/app/(auth)/reset-password/page.tsx`
