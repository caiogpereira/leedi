---
baseline_commit: 9ea8a05
---

# Story 19.1: Wizard Infrastructure & Progress Persistence

Status: ready-for-dev

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

- [ ] Task 1: `tenants.config` onboarding schema definition (AC: #1, #3, #4, #5)
  - [ ] No new migration needed — `tenants.config` is already a `jsonb` column
  - [ ] Define onboarding config shape in `packages/db/src/types/onboarding-config.ts`:
    ```ts
    export interface OnboardingConfig {
      onboarding_completed: boolean;
      current_step: number; // 1-5
      steps: {
        [step: number]: Record<string, unknown>; // saved form data per step
      };
    }
    ```
  - [ ] Export type from `packages/db/src/index.ts`

- [ ] Task 2: Onboarding progress API (AC: #4, #5, #6)
  - [ ] Create `apps/api/src/routes/onboarding.ts`
  - [ ] `GET /api/onboarding/progress`: read `tenants.config` for authed tenant; return `{ currentStep, completedSteps, stepData }` derived from `config.onboarding_config`
  - [ ] `PATCH /api/onboarding/progress`: body `{ step: number, data: object }` → merge `data` into `tenants.config.onboarding_config.steps[step]`; advance `current_step` to `step + 1` if not already past; respond with updated progress
  - [ ] RBAC: `requireRole(['owner'])` on both endpoints
  - [ ] Register in `apps/api/src/app.ts`

- [ ] Task 3: Next.js middleware redirect for onboarding (AC: #1, #2)
  - [ ] In `apps/dashboard/middleware.ts` (or create if it doesn't exist):
    - For authenticated requests to `/(dashboard)/**` paths:
      - If `session.tenantStatus === 'trial'` AND `session.onboardingCompleted !== true`: redirect to `/onboarding`
    - For requests to `/onboarding/**`: allow through if authenticated (no redirect loop)
  - [ ] The session must carry `onboarding_completed` — add this field to the Better-Auth session data or read it from the tenant on each request
  - [ ] Alternative: check via `GET /api/onboarding/progress` on the dashboard layout server component — if `currentStep < 5` and tenant is `trial`, redirect

- [ ] Task 4: Onboarding wizard shell and step router (AC: #3, #7)
  - [ ] Create `apps/dashboard/app/onboarding/layout.tsx` — full-screen layout (no sidebar/header from main dashboard); includes step indicator at top
  - [ ] Create `apps/dashboard/app/onboarding/page.tsx` — client component that:
    - Fetches `GET /api/onboarding/progress`
    - Renders the appropriate step component based on `currentStep`
    - Manages local step state (optimistic)
  - [ ] Create `apps/dashboard/app/onboarding/_components/step-indicator.tsx` — 5 steps numbered, `CheckCircle` icon (shadcn/ui) for completed, `Circle` for pending, highlight for current
  - [ ] Create stub step components: `apps/dashboard/app/onboarding/_components/step-1.tsx` through `step-5.tsx` (empty placeholders — implemented in Stories 19.2–19.4)

- [ ] Task 5: Tests (AC: #1, #2, #4, #5)
  - [ ] Unit: `GET /api/onboarding/progress` returns correct `currentStep` based on `tenants.config`
  - [ ] Unit: `PATCH /api/onboarding/progress` advances `currentStep` and persists `stepData`
  - [ ] Unit: `PATCH` is idempotent — submitting step 1 twice does not corrupt data
  - [ ] Unit: operator role receives 403 on both endpoints
  - [ ] Component: `StepIndicator` renders checkmarks for completed steps and highlights current

## Dev Notes

- **Files to create:** `packages/db/src/types/onboarding-config.ts`, `apps/api/src/routes/onboarding.ts`, `apps/dashboard/app/onboarding/layout.tsx`, `apps/dashboard/app/onboarding/page.tsx`, `apps/dashboard/app/onboarding/_components/step-indicator.tsx`, `apps/dashboard/app/onboarding/_components/step-{1..5}.tsx` (stubs)
- **Files to modify:** `apps/api/src/app.ts` (register onboarding routes), `apps/dashboard/middleware.ts` (add onboarding redirect), `packages/db/src/index.ts` (export OnboardingConfig type)
- **No DB migration needed** — `tenants.config` jsonb accommodates the onboarding state without schema change.
- **`current_step` default:** if `tenants.config.onboarding_config` is null/absent, return `{ currentStep: 1, completedSteps: [], stepData: {} }` from the API.
- **Redirect approach:** Prefer middleware redirect over server-component redirect to avoid flash of dashboard content. The middleware can read the Better-Auth session (cookie) to get tenant status and onboarding flag. Add `onboarding_completed` to the tenant session object populated during login.
- **Step data persistence:** Each step saves its own form data to `stepData[step]`. This is form state only — the actual entity records (WhatsApp connection, agent config) are created by each step's own API calls (Stories 19.2–19.4). `stepData` is used only to pre-fill the form on resume.
- **Onboarding layout must be separate from `(dashboard)` layout** — no sidebar, simpler header with just logo and "Sair" link.

### Testing standards

- Vitest unit tests for API route logic
- Component test: wizard routes to correct step component based on `currentStep`

### Pitfalls to avoid

- Do NOT redirect owners who have `onboarding_completed = true` — check the flag before redirecting.
- Do NOT put onboarding routes inside the `(dashboard)` route group — they need a separate layout.
- If the session does not carry `onboarding_completed`, fetch it once per layout load (server component). Do NOT poll it on the client.

### References

- [Source: docs/01-leedi-arquitetura.md#5.1 Modelagem de dados] (tenants table + config jsonb)
- [Source: _bmad-output/planning-artifacts/epics.md#Story 19.1, FR10, FR16]
- [Source: _bmad-output/implementation-artifacts/3-1-dashboard-navigation-shell-layout.md] (dashboard layout — onboarding layout is a sibling, not nested)
- [Source: _bmad-output/implementation-artifacts/2-2-user-login-persistent-session.md] (session structure — extend with onboarding flag)

## Dev Agent Record

### Agent Model Used

_not yet assigned_

### Debug Log References

_none_

### Completion Notes List

_not yet implemented_

### File List

_not yet implemented_

### Change Log

_none_
