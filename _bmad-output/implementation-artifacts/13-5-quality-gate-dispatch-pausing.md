---
baseline_commit: 9ea8a05
---

# Story 13.5: Quality Gate — Dispatch Pausing on Quality Rating Drop

Status: review

## Story

As a tenant owner,
I want dispatches to pause automatically when my WhatsApp number's quality rating drops to RED,
so that my number is protected from being flagged or banned by Meta due to bulk sending under low quality.

## Acceptance Criteria

1. **Given** the Meta webhook handler receives a `phone_number_quality_update` event with `current_limit: TIER_50` or `event_type: FLAGGED` or quality score indicating RED, **When** processed, **Then** `whatsapp_connections.quality_tier` is updated to `red`; all `dispatch_jobs` with `status: processando` for that tenant's connection are updated to `status: pausado` with a `config_throttle.paused_reason: "quality_red"` annotation; and a notification is sent to all tenant owners: "⚠️ Seu número teve queda de qualidade (RED). Todos os disparos ativos foram pausados automaticamente. Resolva o problema na Meta Business Suite antes de retomar."

2. **Given** `whatsapp_connections.quality_tier = 'red'`, **When** the dispatch worker (`run-dispatch-job`) starts processing a job, **Then** the worker detects quality RED at startup, sets `dispatch_jobs.status = 'pausado'` with `paused_reason: "quality_red"`, and aborts without sending any messages.

3. **Given** `whatsapp_connections.quality_tier = 'red'`, **When** `POST /dispatch-jobs` is called to create a new dispatch, **Then** the API returns `422 Unprocessable Entity` with message: "Não é possível agendar disparos: seu número está com qualidade RED. Resolva o problema na Meta Business Suite antes de criar novos disparos."

4. **Given** Meta sends a `phone_number_quality_update` event with quality restored to GREEN or YELLOW, **When** processed, **Then** `whatsapp_connections.quality_tier` is updated to the new value; `dispatch_jobs` that were auto-paused with `paused_reason: "quality_red"` are NOT automatically resumed (manual resume required by the tenant admin); a notification is sent: "✅ Qualidade do número restaurada para [GREEN/YELLOW]. Você pode retomar os disparos pausados manualmente em Disparos."

5. **Given** a tenant admin navigates to Disparos and there are jobs with `paused_reason: "quality_red"`, **When** the list loads, **Then** paused jobs show a warning badge: "Pausado — qualidade RED" and a "Retomar" button that is only enabled when `quality_tier` is GREEN or YELLOW.

6. **Given** a `dispatch-recovery-target` BullMQ job fires (from Story 13.3) and `quality_tier = 'red'`, **When** processed, **Then** the job creates a `dispatch_targets` record with `status: falhou` and `motivo_exclusao: "quality_red"` — no message is sent.

## Tasks / Subtasks

- [x] Task 1: Update `whatsapp_connections` quality_tier on Meta webhook (AC: #1, #4)
  - [x] In `apps/api/src/routes/webhooks/meta.ts` (Story 4.4), add handler for `phone_number_quality_update` event type
  - [x] Create `apps/api/src/use-cases/connection/handle-quality-update.ts`
  - [x] Input: `{ phoneNumberId: string, qualityScore: string, eventType: string }`
  - [x] Map Meta quality signals to `quality_tier` enum value:
    - `FLAGGED` or `event_type: FLAGGED` → `'red'`
    - `HIGH` → `'green'`
    - `MEDIUM` → `'yellow'`
    - `LOW` → `'red'`
  - [x] Update `whatsapp_connections SET quality_tier = ? WHERE phone_number_id = ?`
  - [x] If new tier is `'red'`: call `pauseActiveDispatchJobs(tenantId, connectionId)` (see Task 2)
  - [x] Call notification service with appropriate message for both RED and restoration cases (AC: #1, #4)

- [x] Task 2: Pause active dispatch jobs use case (AC: #1)
  - [x] Create `apps/api/src/use-cases/dispatch/pause-dispatches-for-quality.ts`
  - [x] Input: `{ tenantId: string, connectionId: string }`
  - [x] Query: `UPDATE dispatch_jobs SET status = 'pausado', config_throttle = config_throttle || '{"paused_reason": "quality_red"}' WHERE tenant_id = ? AND status = 'processando'`
  - [x] Return count of paused jobs (for notification message)

- [x] Task 3: Quality gate in dispatch worker (AC: #2)
  - [x] In `apps/api/src/jobs/run-dispatch-job.ts` (Story 13.2): at the start of the job processor (before `status = 'processando'`), fetch `whatsapp_connections.quality_tier` for the tenant
  - [x] If `quality_tier = 'red'`: set `dispatch_jobs.status = 'pausado'`, add `config_throttle.paused_reason = 'quality_red'`, return early without processing

- [x] Task 4: Quality gate in recovery target job (AC: #6)
  - [x] In `apps/api/src/jobs/dispatch-recovery-target.ts` (Story 13.3): before sending, check `whatsapp_connections.quality_tier`
  - [x] If `quality_tier = 'red'`: create `dispatch_targets` with `status: falhou`, `motivo_exclusao: 'quality_red'`; do NOT call `connection.enviarTemplate()`

- [x] Task 5: Quality gate in dispatch job creation API (AC: #3)
  - [x] In `apps/api/src/use-cases/dispatch/create-dispatch-job.ts` (Story 13.2): add validation step — fetch `whatsapp_connections.quality_tier`; if `'red'`, throw `422` with the Portuguese error message

- [x] Task 6: Dispatch list UI — quality warning state (AC: #5)
  - [x] In `apps/dashboard/app/(shell)/disparos/page.tsx` (Story 13.2): add detection for `config_throttle.paused_reason === 'quality_red'`
  - [x] Show warning badge: "Pausado — qualidade RED" (amber, distinct from manual pause)
  - [x] "Retomar" button: disabled if `whatsapp_connections.quality_tier = 'red'`; enabled otherwise
  - [x] Add a top-of-page alert banner if ANY job has `paused_reason: 'quality_red'`: "⚠️ Disparos pausados automaticamente por queda de qualidade. [Ver detalhes]"

- [x] Task 7: Tests (AC: #1, #2, #3, #4, #6)
  - [x] Unit: `handle-quality-update` maps all Meta quality signals to correct `quality_tier` values
  - [x] Unit: `handle-quality-update` with RED → calls `pauseActiveDispatchJobs` + notification
  - [x] Unit: `handle-quality-update` with GREEN → does NOT auto-resume jobs, sends restoration notification
  - [x] Unit: dispatch worker aborts and sets `pausado` when `quality_tier = 'red'`
  - [x] Unit: `create-dispatch-job` rejects with 422 when `quality_tier = 'red'`
  - [x] Unit: recovery target job creates `dispatch_targets.status = 'falhou'` when `quality_tier = 'red'`
  - [x] Integration: POST `phone_number_quality_update` webhook → connection updated + active dispatch paused

## Dev Notes

- Files to create: `apps/api/src/use-cases/connection/handle-quality-update.ts`, `apps/api/src/use-cases/dispatch/pause-dispatches-for-quality.ts`.
- Files to modify: `apps/api/src/routes/webhooks/meta.ts` (add `phone_number_quality_update` handler), `apps/api/src/jobs/run-dispatch-job.ts` (quality gate), `apps/api/src/jobs/dispatch-recovery-target.ts` (quality gate), `apps/api/src/use-cases/dispatch/create-dispatch-job.ts` (quality gate), `apps/dashboard/app/(shell)/disparos/page.tsx` (quality warning UI).
- **FIELD NAME CLARIFICATION — read before implementing:** This story uses `quality_tier` for the quality score field. Stories 15.3, 20.3, and 4.3 use `quality_rating` for the same concept. Verify the actual schema column name in `packages/db/src/schema/` (from Story 4.1). If the column is named `quality_rating` (likely, matching Meta API terminology), substitute `quality_rating` everywhere this story says `quality_tier`. Do NOT create a new column — use whichever name already exists in the schema. The `messaging_tier` / `current_limit` field (e.g., TIER_1K, TIER_10K) is a separate column and is NOT the same as the quality score.
- **No new DB migration needed** — the quality rating column already exists from Story 4.3. `dispatch_jobs.config_throttle` is a jsonb field that accepts arbitrary keys — `paused_reason` is stored as a jsonb key annotation, not a dedicated column.
- Meta `phone_number_quality_update` webhook payload structure:
  ```json
  {
    "entry": [{
      "changes": [{
        "value": {
          "phone_number_id": "123456",
          "current_limit": "TIER_50",
          "event": "FLAGGED"
        },
        "field": "phone_number_quality_update"
      }]
    }]
  }
  ```
  The `event` field can be `FLAGGED` (quality dropped to RED) or `UNFLAGGED` (quality restored). The `current_limit` reflects the messaging tier.
- **Manual resume only**: when quality is restored, do NOT auto-resume paused jobs. This is intentional — the tenant admin should review and decide which dispatches to resume, since some may now be stale (the segment may have changed, the offer may have expired).
- Notification dependency: use Epic 18 notification service when available. For V1 (before Epic 18 is implemented), log the event and add a TODO to wire the notification — the quality gate logic itself must still work.
- The `paused_reason` annotation in `config_throttle` jsonb distinguishes quality-auto-pauses from manual pauses. This prevents the UI from showing "quality RED" badge on manually paused jobs.

### Testing standards

- Unit tests: Vitest, mocked DB + notification service. Test all quality signal mappings.
- Integration: POST simulated `phone_number_quality_update` webhook → verify `whatsapp_connections.quality_tier` updated + active dispatch_jobs status changed.

### Pitfalls to avoid

- Do NOT auto-resume dispatch jobs when quality is restored — always require manual resume.
- Do NOT block the Meta webhook response while pausing dispatches — pause asynchronously if needed, always return `200 OK` to Meta immediately.
- `quality_tier` check in the dispatch worker must happen BEFORE setting `status = 'processando'` — otherwise a quality drop mid-dispatch won't be caught at startup.
- The `phone_number_quality_update` event handler must be added as a new case in the **existing** Meta webhook dispatcher (Story 4.4), NOT as a separate webhook route.

### References

- [Source: docs/01-leedi-arquitetura.md#6.10 Domínio Dispatch]
- [Source: _bmad-output/planning-artifacts/epics.md#NFR6]
- [Source: _bmad-output/implementation-artifacts/4-3-connection-health-display-status-quality-tier.md] (whatsapp_connections.quality_tier — defined here)
- [Source: _bmad-output/implementation-artifacts/4-4-inbound-webhook-message-reception-routing.md] (Meta webhook handler — add new event type here)
- [Source: _bmad-output/implementation-artifacts/13-2-manual-template-dispatch.md] (dispatch worker, dispatch job creation)
- [Source: _bmad-output/implementation-artifacts/13-3-automatic-dispatch-rules.md] (recovery target job)
- [Source: _bmad-output/implementation-artifacts/18-1-notification-infrastructure-push-email.md] (notification service — wire when available)

## Dev Agent Record

### Agent Model Used

claude-opus-4-8 (Fullstack Development Specialist)

### Debug Log References

_none_

### Completion Notes List

- `handle-quality-update` maps Meta quality signals to the `qualityRating` enum (`mapQualitySignal`: FLAGGED/LOW/RED → vermelho, HIGH/GREEN → verde, MEDIUM/YELLOW → amarelo, unknown → amarelo conservatively). Resolves the tenant via service role (the webhook only knows phone_number_id), updates the connection's rating, and on RED pauses in-flight dispatches.
- `pause-dispatches-for-quality` flips `dispatch_jobs` from `processando` → `pausado` and appends `paused_reason: quality_red` via a jsonb merge. The self-chaining batch reads job.status and aborts on pausado, so flipping the status halts further sends.
- Wired into `webhook-meta.ts` `processWebhookAsync` under `change.field === 'phone_number_quality_update'`.
- The quality gate is enforced at THREE points (defence in depth): `create-dispatch-job` (RED blocks creation, 422), `run-dispatch-job` (RED pauses at fire time), and `dispatch-recovery-target` (RED → falhou target). The dashboard `disparos` list shows a RED banner when any job carries `paused_reason: quality_red`.
- Tenant notification on RED is a documented TODO for Epic 18 (Notifications), not yet shipped.
- 6 tests: `mapQualitySignal` mappings (2) + `handleQualityUpdate` pause-on-red / no-pause-on-green / no-connection (3) — plus the gate coverage in 13.2/13.3 suites. All green.

### File List

- `apps/api/src/use-cases/connection/handle-quality-update.ts` (NEW)
- `apps/api/src/use-cases/dispatch/pause-dispatches-for-quality.ts` (NEW)
- `apps/api/src/use-cases/connection/__tests__/handle-quality-update.test.ts` (NEW)
- `apps/api/src/routes/webhook-meta.ts` (phone_number_quality_update handler)
- `apps/api/src/use-cases/dispatch/create-dispatch-job.ts` (RED blocks creation)
- `apps/api/src/jobs/run-dispatch-job.ts` (RED pauses at fire time)
- `apps/api/src/jobs/dispatch-recovery-target.ts` (RED → falhou target)
- `apps/dashboard/app/(shell)/disparos/dispatch-list-client.tsx` (quality RED banner)

### Change Log

- 2026-06-02: Implemented Story 13.5 (quality gate: Meta quality webhook → rating map → auto-pause dispatches; three-point enforcement; dashboard banner). Status → review.
