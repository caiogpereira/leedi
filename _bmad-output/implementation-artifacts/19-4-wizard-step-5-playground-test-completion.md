---
baseline_commit: 9ea8a05
---

# Story 19.4: Wizard Step 5 (Playground Test) & Completion

Status: ready-for-dev

## Story

As a **new tenant owner**,
I want to test my agent in the playground as the final step before going live,
so that I can verify everything works and feel confident.

## Acceptance Criteria

1. **Given** the tenant is on wizard Step 5, **When** the page loads, **Then** an embedded playground loads using the wizard's agent configuration (from Steps 3-4) — same as Epic 8's playground but in the wizard layout.
2. **Given** the tenant sends at least one test message and the agent responds, **When** the interaction completes, **Then** the "Concluir configuração" button becomes enabled (it was disabled until the first agent response is received).
3. **Given** the tenant clicks "Concluir configuração" and confirms the modal, **When** confirmed, **Then** `POST /api/onboarding/complete` is called, `tenants.status` is set to `ativo`, `tenants.config.onboarding_completed = true`, and the tenant is redirected to the main dashboard at `/`.
4. **Given** onboarding is completed, **When** the tenant is redirected to `/`, **Then** a welcome notification fires: `{ tipo: 'onboarding_concluido', titulo: 'Configuração concluída! Seu agente está pronto para atender leads.' }`.
5. **Given** the tenant closes the browser during Step 5 (without completing), **When** they return, **Then** the wizard is on Step 5 and the playground is ready to test again — no prior test messages are shown (playground state is ephemeral).
6. **Given** the playground in the wizard, **When** the agent generates a response, **Then** no real WhatsApp messages are sent and the conversation is NOT counted against the usage limit — same sandbox behaviour as Epic 8.

## Tasks / Subtasks

- [ ] Task 1: Completion API endpoint (AC: #3, #4)
  - [ ] Add `POST /api/onboarding/complete` to `apps/api/src/routes/onboarding.ts`:
    - RBAC: owner only
    - Sets `tenants.status = 'ativo'` in DB
    - Sets `tenants.config.onboarding_completed = true` and `tenants.config.current_step = 5` in the jsonb config
    - Inserts an `audit_log` entry: `{ acao: 'onboarding_completed', entidade: 'tenant', entidade_id: tenantId }`
    - Triggers welcome notification via `sendNotification({ tipo: 'onboarding_concluido', ... })`
    - Returns `{ success: true }`
  - [ ] Idempotent: if `tenants.status` is already `ativo` and `onboarding_completed` is already true, return 200 without re-firing notification

- [ ] Task 2: Step 5 component — Playground Embed (AC: #1, #2, #5, #6)
  - [ ] Implement `apps/dashboard/app/onboarding/_components/step-5.tsx`
  - [ ] Embed the playground chat interface (Story 8.1) — reuse the `PlaygroundChat` component from `apps/dashboard/app/(dashboard)/playground/`
  - [ ] Pass `context: 'wizard'` prop to PlaygroundChat to indicate ephemeral mode (no session persistence, not counted in usage)
  - [ ] Track whether agent has responded: listen for first agent message event from PlaygroundChat — when received, set local state `agentResponded = true`
  - [ ] "Concluir configuração" button: disabled until `agentResponded = true`
  - [ ] Clicking "Concluir configuração": show `AlertDialog` (shadcn/ui) confirmation: "Tudo pronto! Ao concluir, seu agente começará a receber leads. Deseja continuar?" with "Sim, vamos lá!" and "Cancelar" buttons

- [ ] Task 3: Redirect and welcome toast on completion (AC: #3, #4)
  - [ ] On `POST /api/onboarding/complete` success:
    - Call `router.push('/')` (Next.js router)
    - Show toast notification (shadcn/ui `toast`): "🎉 Configuração concluída! Seu agente está pronto para atender leads."
  - [ ] The server-side welcome notification (AC #4) is sent by the API endpoint (Task 1) — the toast is in addition to this, shown client-side

- [ ] Task 4: Update middleware to allow completed tenants through (AC: #3)
  - [ ] In `apps/dashboard/middleware.ts` (Story 19.1): after `POST /api/onboarding/complete` sets `onboarding_completed = true`, subsequent requests to `/(dashboard)/**` must NOT redirect to `/onboarding`
  - [ ] The session must be refreshed after completion — call Better-Auth `session.refresh()` or redirect with a fresh session cookie
  - [ ] Alternatively: the middleware reads `tenants.config.onboarding_completed` on each request (add to the tenant session data fetched at login)

- [ ] Task 5: PostHog event tracking (AC: #3)
  - [ ] On `POST /api/onboarding/complete` success:
    - Track PostHog event: `posthog.capture('onboarding_completed', { tenantId, plano: tenant.plano, completedAt: new Date() })`
    - This feeds the onboarding funnel in PostHog (per NFR / architecture observability notes)

- [ ] Task 6: Tests (AC: #2, #3, #4, #6)
  - [ ] Unit: `POST /api/onboarding/complete` sets `tenants.status = 'ativo'` and `onboarding_completed = true`
  - [ ] Unit: `POST /api/onboarding/complete` is idempotent — second call for already-completed tenant returns 200 without re-notifying
  - [ ] Unit: operator role receives 403 on `/api/onboarding/complete`
  - [ ] Component: "Concluir configuração" is disabled until `agentResponded = true`
  - [ ] Component: confirmation dialog appears before completing; cancelling leaves the user on Step 5

## Dev Notes

- **Files to create:** `apps/dashboard/app/onboarding/_components/step-5.tsx`
- **Files to modify:** `apps/api/src/routes/onboarding.ts` (add `/complete` endpoint), `apps/dashboard/middleware.ts` (allow completed tenants)
- **PlaygroundChat reuse:** The `PlaygroundChat` component from Epic 8 (Story 8.1) must be importable from `apps/dashboard/app/(dashboard)/playground/`. If it's not already a reusable component, refactor it to accept a `mode: 'wizard' | 'dashboard'` prop in this story.
- **`context: 'wizard'` behaviour:** When called from wizard mode, the playground must:
  1. NOT create a `conversation_window` billable record (usage.conversas_usadas is NOT incremented)
  2. NOT send real WhatsApp messages
  3. NOT persist `messages` to the main `messages` table (ephemeral only)
  — These are the same sandbox constraints from Story 8.2. Reuse the same mechanism.
- **Session refresh after completion:** Better-Auth sessions may cache the tenant status. After calling `/api/onboarding/complete`, the client must either refresh the session or redirect to `/` with a page reload (`window.location.href = '/'`) so the middleware reads fresh tenant state.
- **Welcome notification template:** Create `packages/notification/src/templates/welcome.tsx` React Email template for the `onboarding_concluido` email variant.

### Testing standards

- Unit tests for the completion endpoint
- Component test: full Step 5 flow — send message → agent responds → button enables → confirm → redirect

### Pitfalls to avoid

- Do NOT enable the "Concluir" button without at least one agent response — this is the quality gate ensuring the tenant actually tested the flow.
- Do NOT fire the PostHog event if `onboarding_complete` was already true (idempotency check).
- Do NOT confuse the client-side toast with the server-side notification. Both fire: toast is immediate UX feedback; push/email notification is for async delivery (e.g., they're on mobile and want to know it worked).

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 19.4, FR15, FR16]
- [Source: _bmad-output/implementation-artifacts/19-1-wizard-infrastructure-progress-persistence.md] (onboarding API, middleware)
- [Source: _bmad-output/implementation-artifacts/8-1-playground-chat-interface.md] (PlaygroundChat component to reuse)
- [Source: _bmad-output/implementation-artifacts/8-2-scenario-simulation-tool-transparency.md] (sandbox behaviour — no real messages, no usage count)
- [Source: _bmad-output/implementation-artifacts/18-1-notification-infrastructure-push-email.md] (sendNotification for welcome notification)

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
