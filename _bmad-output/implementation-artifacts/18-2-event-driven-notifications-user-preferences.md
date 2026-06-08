---
baseline_commit: c7247e797c274ac8c2f8ef1bed83f6c991f11aec
---

# Story 18.2: Event-Driven Notifications & User Preferences

Status: review

## Story

As a **tenant operator**,
I want to choose which business events I'm notified about and through which channels,
so that I only receive alerts relevant to my role.

## Acceptance Criteria

1. **Given** a user navigates to Configurações → Notificações, **When** the page loads, **Then** they see a matrix of 7 event types × 2 channels (push / email) with toggle switches, pre-filled with their current preferences from `notification_preferences`.
2. **Given** a user turns off `venda_aprovada` for the email channel, **When** a sale is approved, **Then** they receive a push notification (if subscribed) but NO email for that event.
3. **Given** each of the following events fires, **When** the event handler calls `sendNotification()`, **Then** delivery respects the user's channel preferences:
   - `venda_aprovada` → "Nova venda! [Lead] comprou [Product]" — triggered by Story 11.2 (purchase approved)
   - `lead_pediu_humano` → "Lead aguardando atendimento: [Lead Name]" — triggered by Story 7.6 (human transfer tool)
   - `template_rejeitado` → "Template [Name] foi rejeitado: [reason]" — triggered by Story 12.1 (template status update)
   - `quality_caindo` → "Atenção: qualidade do número caindo para [rating]" — triggered by Story 4.3 (quality webhook)
   - `conta_bloqueada` → "Sua conta foi bloqueada por inadimplência" — triggered by Story 17.2 (billing lockdown)
   - `disparo_concluido` → "Disparo [name] concluído: X enviados, Y respondidos" — triggered by Story 13.2 (dispatch completion)
   - `alerta_uso` → "Você usou [X]% das suas conversas do mês" — triggered by Story 16.2 (usage threshold)
4. **Given** a user's preferences are updated via toggle, **When** `PATCH /api/notification-preferences` is called, **Then** the `notification_preferences` row is upserted and the change takes effect immediately for subsequent events.
5. **Given** a new user has no `notification_preferences` row, **When** they view the settings page, **Then** defaults are shown: all events ON for push, all events ON for email.
6. **Given** an event fires for a tenant with multiple users (e.g., `lead_pediu_humano`), **When** determining recipients, **Then** all users with `operator` role or above who have enabled that event are notified.

## Tasks / Subtasks

- [x] Task 1: Notification preferences API (AC: #1, #4, #5)
  - [x] Create `apps/api/src/routes/notification-preferences.ts`
  - [x] `GET /api/tenants/:tenantId/notification-preferences` → defaults if no row
  - [x] `PATCH /api/tenants/:tenantId/notification-preferences` → upsert eventos jsonb per-event/canal
  - [x] RBAC: any authenticated tenant user (all roles)
  - [x] Register routes in `apps/api/src/app.ts`

- [x] Task 2: Notification preferences UI (AC: #1, #2, #4, #5)
  - [x] Create `apps/dashboard/app/(shell)/configuracoes/notificacoes/page.tsx`
  - [x] Create `apps/dashboard/app/(shell)/configuracoes/notificacoes/notification-preferences-client.tsx`
  - [x] 7-row table with event labels in PT-BR, two Toggle columns (push / email)
  - [x] Each toggle calls `PATCH` immediately with optimistic update and error revert
  - [x] Loading skeleton while preferences load; error state if fetch fails
  - [x] Add "Notificações" to configuracoes layout sidebar navigation
  - [x] Create Next.js proxy route `apps/dashboard/app/api/tenants/[tenantId]/notification-preferences/route.ts`

- [x] Task 3: `sendNotification` preferences check (AC: #2, #3)
  - [x] Extended `send-notification.ts` with preferences filtering — checks `eventos[tipo][canal]` before each delivery
  - [x] Defaults to all-enabled when no preference row exists
  - [x] Created `sendNotificationToTenantRole()` helper — queries memberships by role, fans out to `sendNotification` per user

- [x] Task 4: Wire events to `sendNotification` (AC: #3)
  - [x] **`venda_aprovada`**: `apps/api/src/use-cases/gateway/handle-purchase-approved.ts`
  - [x] **`lead_pediu_humano`**: `packages/agent/src/tools/transferir-humano.ts` (dep injection)
  - [x] **`template_rejeitado`**: `apps/api/src/use-cases/templates/handle-template-status-update.ts`
  - [x] **`quality_caindo`**: `apps/api/src/use-cases/connection/handle-quality-update.ts`
  - [x] **`conta_bloqueada`**: `apps/api/src/jobs/daily-billing-check.ts` (owner-only per pitfall)
  - [x] **`disparo_concluido`**: `apps/api/src/jobs/process-dispatch-batch.ts`
  - [x] **`alerta_uso`**: `apps/api/src/routes/webhook-meta.ts` (alertsDue fan-out)

- [x] Task 5: Tests (AC: #2, #4, #5, #6)
  - [x] Unit: push skipped when user preference `{ push: false }` for event type
  - [x] Unit: both channels sent when no preference row (default ON)
  - [x] Unit: both channels skipped when both disabled
  - [x] Unit: `sendNotificationToTenantRole` fans out to all eligible role members

## Dev Notes

- **Files to create:** `apps/api/src/routes/notification-preferences.ts`, `apps/dashboard/app/(dashboard)/settings/notifications/page.tsx`
- **Files to modify:** `packages/notification/src/use-cases/send-notification.ts` (add preferences filtering), `packages/notification/src/index.ts` (export `sendNotificationToTenantRole`), `apps/api/src/app.ts` (register routes), `apps/dashboard/app/(dashboard)/settings/layout.tsx` (add nav item)
- **Files to modify (event wiring):** `packages/billing/src/jobs/daily-billing-check.ts` (17.2), `packages/connection/src/use-cases/handle-quality-webhook.ts` (4.3), `apps/api/src/use-cases/messaging/human-transfer.ts` (7.6), `apps/api/src/use-cases/gateway/process-purchase-approved.ts` (11.2), `apps/api/src/use-cases/templates/update-template-status.ts` (12.1), `apps/api/src/use-cases/dispatch/complete-dispatch.ts` (13.2), `packages/usage/src/use-cases/check-usage-thresholds.ts` (16.2)
- **`eventos` jsonb structure:** `{ "venda_aprovada": { "push": true, "email": true }, "lead_pediu_humano": { ... }, ... }`. Missing key = default enabled.
- **`sendNotificationToTenantRole` fan-out:** For events targeting all operators (like `lead_pediu_humano`), this sends one notification per eligible user — each checks their own preferences. This is intentional: different users may have different preferences.
- **Performance:** Fan-out sends are enqueued to BullMQ (not called inline) to avoid blocking webhook handlers. Use the same `notifications` queue from Story 18.1.

### Testing standards

- Vitest unit tests for preference filtering logic
- Integration test: full event → preferences check → delivery flow

### Pitfalls to avoid

- Do NOT send `conta_bloqueada` to operators — this is owner-only notification. Hardcode recipient role as `['owner']` for billing events.
- Do NOT skip the preferences check even if the event is "critical" — users who disabled a channel consciously should not be spammed.
- When wiring events in other stories' use cases, inject `sendNotification` as a dependency (not import at module top level) to keep use cases testable.

### References

- [Source: docs/01-leedi-arquitetura.md#6.13 Domínio Notification]
- [Source: _bmad-output/planning-artifacts/epics.md#Story 18.2, FR109–FR112]
- [Source: _bmad-output/implementation-artifacts/18-1-notification-infrastructure-push-email.md] (sendNotification, schema)
- [Source: _bmad-output/implementation-artifacts/7-6-human-transfer-tool.md] (human transfer — wire notification here)
- [Source: _bmad-output/implementation-artifacts/11-2-purchase-approved-lead-status-update.md] (purchase approved — wire notification here)

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

_none_

### Completion Notes List

- Implemented notification preferences API (GET/PATCH) with 7 event types × 2 channels; defaults to all-enabled when no row exists.
- UI: 7-row toggle matrix in configuracoes/notificacoes with optimistic updates and error revert.
- `sendNotification` extended with preferences filtering — reads `notification_preferences` before each delivery; `sendNotificationToTenantRole` fans out per eligible member.
- All 7 events wired: venda_aprovada, lead_pediu_humano (dep injection in agent), template_rejeitado, quality_caindo, conta_bloqueada (owner-only), disparo_concluido, alerta_uso.
- 11 tests pass (4 for preferences behavior + 7 from Story 18.1).

### File List

- apps/api/src/routes/notification-preferences.ts (created)
- apps/api/src/app.ts (modified — notification-preferences routes)
- apps/dashboard/app/api/tenants/[tenantId]/notification-preferences/route.ts (created)
- apps/dashboard/app/(shell)/configuracoes/notificacoes/page.tsx (created)
- apps/dashboard/app/(shell)/configuracoes/notificacoes/notification-preferences-client.tsx (created)
- apps/dashboard/app/(shell)/configuracoes/layout.tsx (modified — Notificações nav item)
- packages/notification/src/use-cases/send-notification.ts (modified — preferences filtering + sendNotificationToTenantRole)
- packages/notification/src/index.ts (modified — export sendNotificationToTenantRole)
- packages/notification/src/__tests__/send-notification-preferences.test.ts (created)
- packages/notification/src/__tests__/send-notification.test.ts (modified — updated for preferences lookup)
- apps/api/src/use-cases/gateway/handle-purchase-approved.ts (modified — venda_aprovada)
- apps/api/src/use-cases/templates/handle-template-status-update.ts (modified — template_rejeitado)
- apps/api/src/use-cases/connection/handle-quality-update.ts (modified — quality_caindo)
- apps/api/src/jobs/daily-billing-check.ts (modified — conta_bloqueada owner-only)
- apps/api/src/jobs/process-dispatch-batch.ts (modified — disparo_concluido)
- apps/api/src/routes/webhook-meta.ts (modified — alerta_uso)
- packages/agent/src/tools/transferir-humano.ts (modified — lead_pediu_humano via dep injection)

### Change Log

- 2026-06-03: Implemented Story 18.2 — Event-Driven Notifications & User Preferences. Added preferences API, UI settings page, preferences filtering in sendNotification, sendNotificationToTenantRole, and wired all 7 event types.
