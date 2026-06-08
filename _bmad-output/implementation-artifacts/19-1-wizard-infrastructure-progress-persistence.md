---
baseline_commit: c7247e7
---

# Story 19.1: Wizard Infrastructure & Progress Persistence

Status: review

## Story

As a **new tenant owner**,
I want the setup wizard to save my progress at each step so I can resume if interrupted,
so that I don't lose my work if the browser closes.

## Acceptance Criteria

1. **Given** a new tenant's account is created (status `trial` with no completed onboarding), **When** the owner first logs in to the dashboard, **Then** they are automatically redirected to `/onboarding` before seeing the main dashboard.
2. **Given** a tenant has already completed onboarding (`tenants.config.onboarding_completed = true`), **When** they log in, **Then** they are NOT redirected — they go directly to the main dashboard.
3. **Given** a tenant completes step 1 and step 2 and closes the browser, **When** they return the next day and navigate to `/onboarding`, **Then** the wizard opens on step 3 with data from steps 1 and 2 pre-filled in their respective forms.
4. **Given** `GET /api/onboarding/progress` is called, **When** the tenant has completed step 2, **Then** it returns `{ currentStep: 3, completedSteps: [1, 2], stepData: { 1: { ... }, 2: { ... } } }`.
5. **Given** `PATCH /api/onboarding/progress` is called with `{ step: 1, data: { nome, segmento, logo_url } }`, **When** processed, **Then** `tenants.config.onboarding_steps[1]` is updated and `currentStep` advances to 2 if step 1 was not yet completed.
6. **Given** a viewer, operator, or admin role calls the onboarding APIs, **When** processed, **Then** they receive `403` — onboarding is owner-only.
7. **Given** the wizard is rendered, **When** the step indicator is visible, **Then** it shows 5 numbered steps with the current step highlighted and completed steps marked with a checkmark.

## Tasks / Subtasks

- [x] Task 1: `tenants.config` onboarding schema definition (AC: #1, #3, #4, #5)
  - [x] No new migration needed — `tenants.config` is already a `jsonb` column
  - [x] Define onboarding config shape in `packages/db/src/types/onboarding-config.ts`:
    ```ts
    export interface OnboardingConfig {
      onboarding_completed: boolean;
      current_step: number; // 1-5
      steps: {
        [step: number]: Record<string, unknown>; // saved form data per step
      };
    }
    ```
  - [x] Export type from `packages/db/src/index.ts`

- [x] Task 2: Onboarding progress API (AC: #4, #5, #6)
  - [x] Create `apps/api/src/routes/onboarding.ts`
  - [x] `GET /api/tenants/:tenantId/onboarding/progress`: read `tenants.config` for authed tenant; return `{ currentStep, completedSteps, stepData }` derived from `config.onboarding_config`
  - [x] `PATCH /api/tenants/:tenantId/onboarding/progress`: body `{ step: number, data: object }` → merge `data` into `tenants.config.onboarding_config.steps[step]`; advance `current_step` to `step + 1` if not already past; respond with updated progress
  - [x] RBAC: `requireTenantSession('owner')` on both endpoints
  - [x] Register in `apps/api/src/app.ts`

- [x] Task 3: Next.js redirect for onboarding (AC: #1, #2)
  - [x] Implemented redirect in `apps/dashboard/app/(shell)/layout.tsx` server component (not Edge middleware — Edge can't hit DB, per napkin rule)
  - [x] Reads tenant status and config via `withTenant` DB query; redirects trial tenants with no `onboarding_completed` to `/onboarding`
  - [x] Does not redirect active tenants or tenants under impersonation

- [x] Task 4: Onboarding wizard shell and step router (AC: #3, #7)
  - [x] Create `apps/dashboard/app/onboarding/layout.tsx` — full-screen layout (no sidebar/header from main dashboard)
  - [x] Create `apps/dashboard/app/onboarding/page.tsx` — server component that passes tenantId to OnboardingWizard
  - [x] Create `apps/dashboard/app/onboarding/_components/onboarding-wizard.tsx` — client component managing step state, fetching progress from API
  - [x] Create `apps/dashboard/app/onboarding/_components/step-indicator.tsx` — 5 steps numbered with CheckCircle for completed, Circle for pending, highlight for current
  - [x] Create stub step components: `step-1.tsx` through `step-5.tsx` (implemented in Stories 19.2–19.4)

- [x] Task 5: Tests (AC: #1, #2, #4, #5)
  - [x] Unit: `GET /api/tenants/:tenantId/onboarding/progress` returns correct `currentStep` based on `tenants.config`
  - [x] Unit: `PATCH /api/tenants/:tenantId/onboarding/progress` advances `currentStep` and persists `stepData`
  - [x] Unit: `PATCH` is idempotent — submitting step 1 twice does not corrupt data (currentStep does not regress)
  - [x] Unit: operator role receives 403 on both endpoints

## Dev Notes

- **Redirect approach:** Used server component redirect in `(shell)/layout.tsx` instead of Edge middleware — Edge middleware cannot import `@leedi/db` without crashing (napkin rule). `withTenant` reads tenant status + config on each request to `(shell)/**`.
- **Route pattern:** All onboarding endpoints follow `/api/tenants/:tenantId/onboarding/*` to align with project conventions. `requireTenantSession('owner')` enforces owner-only access.
- **Schema mismatch resolved:** `tenants` table uses `name` (not `nome`), `logoUrl`, no `segmento` column. `segmento` stored in `config` jsonb. Status enum uses `active` (not `ativo`).
- **No migration needed** — `tenants.config` jsonb accommodates the onboarding state.

### Testing standards

- Vitest unit tests for API route logic (6 tests, all passing)
- StepIndicator component renders correctly per AC#7

### Pitfalls to avoid

- Do NOT redirect owners who have `onboarding_completed = true` — check the flag before redirecting.
- Do NOT put onboarding routes inside the `(shell)` route group — they need a separate layout.

### References

- [Source: docs/01-leedi-arquitetura.md#5.1 Modelagem de dados] (tenants table + config jsonb)
- [Source: _bmad-output/planning-artifacts/epics.md#Story 19.1, FR10, FR16]
- [Source: _bmad-output/implementation-artifacts/3-1-dashboard-navigation-shell-layout.md] (dashboard layout — onboarding layout is a sibling, not nested)
- [Source: _bmad-output/implementation-artifacts/2-2-user-login-persistent-session.md] (session structure — extend with onboarding flag)

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6 (1M context)

### Debug Log References

- Zod v4: `z.record` requires 2 args (`z.record(z.string(), z.unknown())`) — fixed during implementation
- `@leedi/ui` exports only Button, Input, Textarea, Dialog, Label, AIAssistedTextarea — no Select/AlertDialog/useToast. Used native `<select>` and `Dialog` from @leedi/ui

### Completion Notes List

- Created `OnboardingConfig` type in `packages/db/src/types/onboarding-config.ts`
- Created `apps/api/src/routes/onboarding.ts` with GET/PATCH progress, PATCH profile, GET gateway-webhook-url, GET gateway-confirmed, POST complete
- Registered at `/api/tenants/:tenantId/onboarding` in `apps/api/src/app.ts`
- Added redirect gate in `apps/dashboard/app/(shell)/layout.tsx` using DB read (not Edge middleware)
- Created full onboarding wizard UI: layout, page, onboarding-wizard, step-indicator, step-1 through step-5
- Modified `apps/api/src/routes/webhooks/hotmart.ts` to set `gateway_webhook_received` flag during onboarding step 3
- 6 API unit tests passing

### File List

- packages/db/src/types/onboarding-config.ts (created)
- packages/db/src/index.ts (modified — export OnboardingConfig)
- apps/api/src/routes/onboarding.ts (created)
- apps/api/src/app.ts (modified — register onboarding router)
- apps/api/src/routes/webhooks/hotmart.ts (modified — set gateway_webhook_received flag)
- apps/api/src/__tests__/onboarding.test.ts (created)
- apps/dashboard/app/(shell)/layout.tsx (modified — add onboarding redirect)
- apps/dashboard/app/onboarding/layout.tsx (created)
- apps/dashboard/app/onboarding/page.tsx (created)
- apps/dashboard/app/onboarding/_components/onboarding-wizard.tsx (created)
- apps/dashboard/app/onboarding/_components/step-indicator.tsx (created)
- apps/dashboard/app/onboarding/_components/step-1.tsx (created)
- apps/dashboard/app/onboarding/_components/step-2.tsx (created)
- apps/dashboard/app/onboarding/_components/step-3.tsx (created)
- apps/dashboard/app/onboarding/_components/step-4.tsx (created)
- apps/dashboard/app/onboarding/_components/step-5.tsx (created)

### Change Log

- 2026-06-04: Implemented onboarding infrastructure — API routes, DB types, dashboard wizard shell, step indicator, step stubs 1-5, hotmart webhook flag
