---
baseline_commit: 9ea8a05
---

# Story 18.2: Event-Driven Notifications & User Preferences

Status: ready-for-dev

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

- [ ] Task 1: Notification preferences API (AC: #1, #4, #5)
  - [ ] Create `apps/api/src/routes/notification-preferences.ts`
  - [ ] `GET /api/notification-preferences`: return `notification_preferences WHERE user_id = authedUser`; if no row exists, return default object `{ canais: { push: true, email: true }, eventos: { venda_aprovada: { push: true, email: true }, ... } }`
  - [ ] `PATCH /api/notification-preferences`: body `{ tipo: string, canal: 'push' | 'email', enabled: boolean }` → upsert `notification_preferences` for `(tenant_id, user_id)`, merge into `eventos` jsonb
  - [ ] RBAC: any authenticated tenant user (all roles)

- [ ] Task 2: Notification preferences UI (AC: #1, #2, #4, #5)
  - [ ] Create `apps/dashboard/app/(dashboard)/settings/notifications/page.tsx`
  - [ ] 7-row table with event labels in PT-BR, two `Switch` columns (push / email)
  - [ ] Event label map:
    - `venda_aprovada` → "Nova venda aprovada"
    - `lead_pediu_humano` → "Lead pediu atendimento humano"
    - `template_rejeitado` → "Template rejeitado pela Meta"
    - `quality_caindo` → "Qualidade do número caindo"
    - `conta_bloqueada` → "Conta bloqueada por inadimplência"
    - `disparo_concluido` → "Disparo de mensagens concluído"
    - `alerta_uso` → "Alerta de uso de conversas"
  - [ ] Each toggle calls `PATCH /api/notification-preferences` on change (debounced or immediate)
  - [ ] Loading skeleton while preferences load; error state if fetch fails
  - [ ] Add "Notificações" to settings sidebar navigation

- [ ] Task 3: `sendNotification` preferences check (AC: #2, #3)
  - [ ] Extend `packages/notification/src/use-cases/send-notification.ts` (Story 18.1) with preferences filtering:
    - Input now accepts `tipo: string` in addition to existing params
    - Before sending, load `notification_preferences WHERE user_id = userId`
    - Check `eventos[tipo][canal]` — if `false` (user disabled this event/channel), skip that channel
    - If user has no preference row, default = all enabled
  - [ ] `sendNotificationToTenantRole()` helper: given `{ tenantId, role, tipo, titulo, corpo }`, query all `memberships WHERE tenant_id = tenantId AND papel IN (roles)`, then call `sendNotification` per user (respecting per-user preferences)

- [ ] Task 4: Wire events to `sendNotification` (AC: #3)
  - [ ] **`venda_aprovada`** (Story 11.2 `purchase-approved` use case): after marking lead as buyer, call `sendNotificationToTenantRole({ tenantId, role: ['owner', 'admin', 'operator'], tipo: 'venda_aprovada', titulo: 'Nova venda!', corpo: `${lead.nome} comprou ${product.nome}` })`
  - [ ] **`lead_pediu_humano`** (Story 7.6 human-transfer tool): after creating inbox assignment, call `sendNotificationToTenantRole({ ..., tipo: 'lead_pediu_humano', corpo: `Lead aguardando: ${lead.nome || lead.telefone}` })`
  - [ ] **`template_rejeitado`** (Story 12.1 template status webhook): after updating template status to `rejeitado`, call `sendNotificationToTenantRole({ ..., tipo: 'template_rejeitado', corpo: `Template "${template.nome}" foi rejeitado: ${rejection_reason}` })`
  - [ ] **`quality_caindo`** (Story 4.3 quality rating webhook): when quality drops from green→yellow or yellow→red, call notification
  - [ ] **`conta_bloqueada`** (Story 17.2 billing): replace existing stub with call to `sendNotification` with user preferences respected
  - [ ] **`disparo_concluido`** (Story 13.2 dispatch job): after batch completes, call `sendNotificationToTenantRole`
  - [ ] **`alerta_uso`** (Story 16.2): replace existing notification stub with preferences-respecting call

- [ ] Task 5: Tests (AC: #2, #4, #5, #6)
  - [ ] Unit: `sendNotification` with `tipo: 'venda_aprovada'` and user preference `{ venda_aprovada: { email: false } }` → push only sent, no email
  - [ ] Unit: `sendNotification` with no preference row → both channels sent (default ON)
  - [ ] Unit: `sendNotificationToTenantRole` sends to all operators + admins + owners; skips viewer
  - [ ] Unit: `PATCH /api/notification-preferences` upserts correctly without overwriting other events
  - [ ] Component: notification matrix renders toggles from API response; toggle triggers PATCH

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

_not yet assigned_

### Debug Log References

_none_

### Completion Notes List

_not yet implemented_

### File List

_not yet implemented_

### Change Log

_none_
