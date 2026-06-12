---
baseline_commit: c7247e7
---

# Story 19.4: Wizard Step 5 (Playground Test) & Completion

Status: review

## Story

As a **new tenant owner**,
I want to test my agent in the playground as the final step before going live,
so that I can verify everything works and feel confident.

## Acceptance Criteria

1. **Given** the tenant is on wizard Step 5, **When** the page loads, **Then** an embedded playground loads using sandbox mode (same as Epic 8).
2. **Given** the tenant sends at least one test message and the agent responds, **When** the interaction completes, **Then** the "Concluir configuração" button becomes enabled.
3. **Given** the tenant clicks "Concluir configuração" and confirms the modal, **When** confirmed, **Then** `POST /api/tenants/:tenantId/onboarding/complete` is called, tenant status becomes `active`, `onboarding_completed = true`, and tenant is redirected to `/`.
4. **Given** onboarding is completed, **When** the tenant is redirected to `/`, **Then** the shell layout no longer redirects them to `/onboarding` (DB reads active status).
5. **Given** the tenant closes the browser during Step 5, **When** they return, **Then** the wizard is on Step 5 (playground ephemeral — no prior messages).
6. **Given** the playground in wizard, **When** the agent responds, **Then** no real WhatsApp messages are sent (same sandbox as Epic 8).

## Tasks / Subtasks

- [x] Task 1: Completion API endpoint (AC: #3, #4)
  - [x] `POST /api/tenants/:tenantId/onboarding/complete` implemented in `apps/api/src/routes/onboarding.ts`
  - [x] Sets `tenants.status = 'active'` and `onboarding_completed = true` in config jsonb
  - [x] Inserts audit log entry
  - [x] Idempotent: returns 200 without re-firing notification if already completed
  - [x] Fires welcome notification via `console.info('[notification:stub]...`)` (Epic 18 pattern)

- [x] Task 2: Step 5 component — Playground Embed (AC: #1, #2, #5, #6)
  - [x] Implemented `apps/dashboard/app/onboarding/_components/step-5.tsx`
  - [x] Embedded playground using existing `POST /api/tenants/:tenantId/playground/message` API
  - [x] Tracks `agentResponded` state — enabled "Concluir" only after first agent response

- [x] Task 3: Redirect and completion dialog (AC: #3)
  - [x] `AlertDialog`-style confirmation using `Dialog` from `@leedi/ui` (AlertDialog not in UI package)
  - [x] On confirm: calls `POST /complete`, then `window.location.href = '/'` for full reload
  - [x] Full reload ensures shell layout re-reads updated tenant status from DB

- [x] Task 4: Middleware allows completed tenants through (AC: #4)
  - [x] Shell layout redirect check: `tenant.status === 'trial' && !cfg.onboarding_completed`
  - [x] Active tenants (`status = 'active'`) are never redirected to `/onboarding`

- [x] Task 5: PostHog tracking — deferred (notification stub in place per Epic 18 pattern)

- [x] Task 6: Tests (AC: #2, #3)
  - [x] Component: "Concluir" is disabled before agent responds
  - [x] Component: enables after agent responds
  - [x] Component: dialog shows on click, cancel keeps user on step 5
  - [x] Component: POST /onboarding/complete is called on confirm
  - [x] API: sets status to active, returns success
  - [x] API: idempotent — second call returns 200
  - [x] API: operator role receives 403

## Dev Notes

- **Shell layout gate:** Uses `tenant.status === 'trial'` check (not just the config flag) so existing active tenants who predate the onboarding flow are never blocked.
- **Session refresh:** Full `window.location.href = '/'` reload is used instead of `router.push('/')`. This ensures the shell layout re-runs as a server component and reads the updated tenant status from DB.
- **AlertDialog vs Dialog:** `@leedi/ui` does not export AlertDialog. Used `Dialog` + manual confirm/cancel buttons instead.
- **Notification:** Uses `console.info('[notification:stub]')` pattern per Epic 18 napkin rule (avoid importing `@leedi/notification` eagerly).

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6 (1M context)

### Completion Notes List

- step-5.tsx: embedded playground with agentResponded gate; Dialog confirmation before completion
- POST /complete: sets status='active', onboarding_completed=true, inserts audit log, stub notification
- Shell layout redirect: reads DB on every request to (shell)/** — gate is `status==='trial' && !cfg.onboarding_completed`
- 5 step-5 component tests, 3 API completion tests — all passing

### File List

- apps/dashboard/app/onboarding/_components/step-5.tsx (implemented — was stub from 19.1)
- apps/dashboard/app/onboarding/_components/__tests__/step-5.test.tsx (created)
- apps/api/src/__tests__/onboarding-complete.test.ts (created)

### Change Log

- 2026-06-04: Implemented Step 5 (playground test + completion) with all tests
- 2026-06-11: Code review (Opus 4.8) — strengthened the `complete` API test (see Code Review Findings)

## Code Review Findings (2026-06-11, Opus 4.8)

**MEDIUM (fixed) — `onboarding-complete.test.ts` "sets status to active" was weak.**
The test asserted only `body.success === true`, which the endpoint returns even
on a no-op (the idempotent path also returns `{ success: true }`). It would have
passed even if the status flip and jsonb write were deleted. **Fix:** the test now
captures every `.set()` payload and every jsonb `execute()` and asserts
`status: 'active'` was written AND `onboarding_config` was persisted (the `sql`
mock was upgraded to embed interpolated args so the payload is visible). Proven
real by mutation: changing `.set({ status: 'active' })` → `'trial'` makes it fail.

**Verified correct (no change):**
- Step 5 component tests are real (assert the `agentResponded` gate disables
  "Concluir", the confirm dialog opens, cancel keeps the user on step 5, and
  `POST /onboarding/complete` fires on confirm). Playground contract matches:
  `POST /playground/message` returns `{ sessionId, segments }` — Step 5 reads both.
- `complete` audit log uses `db.insert(schema.auditLogs)` directly (not
  `withTenant`). This is the project convention for **workspace-scoped**
  `audit_logs` — documented in `write-audit-log.ts` and matched by
  `start-/stop-impersonation`, `tenant-session` middleware, etc. Not a bug.

**LOW (deferred, project-wide) — hardcoded `redirect("http://localhost:3000/login")`
in `onboarding/layout.tsx` (Story 19.1).** This is consistent with the identical
acknowledged-debt literal `LOGIN_ORIGIN = 'http://localhost:3000'` in
`apps/dashboard/middleware.ts` (which gates `/onboarding` and redirects
unauthenticated users *before* this layout's fallback ever runs). Fixing the
layout alone changes nothing user-facing; the correct fix is to env-derive the
login origin in both places at pre-launch. Folds into the existing project-wide
`:3000`-localhost deferral — not an Epic-19-local regression.

Result: api 221/221, dashboard 65/65, api typecheck 0 errors.
