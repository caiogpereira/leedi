---
baseline_commit: 9ea8a05
---

# Story 12.2: Template Status Tracking & Suggested Library

Status: ready-for-dev

## Story

As a tenant admin,
I want to track my templates' Meta approval status in real time and pick from a library of suggested templates,
so that I know which templates are ready and can quickly start from proven formats.

## Acceptance Criteria

1. **Given** the DB migration runs, **When** applied, **Then** table `template_library` exists with columns from Architecture §6.9: `id` (uuid pk), `categoria_ocasiao` (text), `titulo` (text), `descricao` (text), `componentes_sugeridos` (jsonb), `is_global` (bool default true), `created_at`. Seed data includes 8 library entries (see Dev Notes).
2. **Given** Meta sends a `message_template_status_update` webhook with `event: APPROVED` for a template, **When** received at `/webhooks/meta` (existing Meta webhook handler from Story 4.4), **Then** `templates.status` is updated to `aprovado` and a notification is triggered: "Template [nome] foi aprovado! Agora você pode usá-lo em disparos."
3. **Given** Meta sends a `message_template_status_update` webhook with `event: REJECTED`, **When** received, **Then** `templates.status` is updated to `rejeitado`, `templates.motivo_rejeicao` is stored from `reason` field in the webhook, and a notification is triggered: "Template [nome] foi rejeitado pela Meta. Motivo: [reason]."
4. **Given** Meta sends a `message_template_status_update` with an unknown `meta_template_id`, **When** received, **Then** a warning is logged but the webhook returns `200 OK` — no error thrown.
5. **Given** a tenant admin navigates to Templates → Biblioteca, **When** the page loads, **Then** suggested templates are shown in a grid by occasion: Boas-vindas, Carrinho abandonado (1h), Carrinho abandonado (6h), Carrinho abandonado (24h), Última chamada, Pós-compra, Reengajamento, Lembrete de evento.
6. **Given** an admin clicks "Usar este modelo" on a library template, **When** clicked, **Then** the template builder form opens pre-filled with the library entry's `componentes_sugeridos`; all fields are editable; the `nome` field shows a suggested name but is editable; the form behaves exactly as a new template creation.
7. **Given** a tenant has templates in multiple statuses, **When** the templates list page loads, **Then** status badges show: Rascunho (gray), Pendente (yellow), Aprovado (green), Rejeitado (red), Pausado (orange); the list is filterable by status.

## Tasks / Subtasks

- [ ] Task 1: `template_library` table + seed data (AC: #1)
  - [ ] Add `template_library` table to `packages/db/src/schema/template.ts` (no RLS needed — global read-only data)
  - [ ] Generate or update migration (add to the 0011 migration from Story 12.1 — prefer extending the same migration rather than adding a new one for a simple seed table; confirm with architecture lead)
  - [ ] Create seed file `packages/db/src/seeds/template-library.ts` with 8 entries (see Dev Notes for content)
  - [ ] Seed script should be idempotent: `INSERT ... ON CONFLICT (id) DO NOTHING`
- [ ] Task 2: Meta webhook handler — template status updates (AC: #2, #3, #4)
  - [ ] In `apps/api/src/routes/webhooks/meta.ts` (from Story 4.4), add handling for `message_template_status_update` event type inside the existing Meta webhook dispatcher
  - [ ] Create `apps/api/src/use-cases/templates/handle-template-status-update.ts`
  - [ ] Input: `{ meta_template_id, new_status, reason?, waba_id }`
  - [ ] Lookup `templates WHERE meta_template_id = ?`; if not found, log warning and return (AC: #4)
  - [ ] Map Meta statuses: `APPROVED → aprovado`, `REJECTED → rejeitado`, `PAUSED → pausado`, `DISABLED → rejeitado`
  - [ ] Update `templates.status`, `templates.motivo_rejeicao` (if rejected), `templates.updated_at`
  - [ ] Call notification service: `notification.enviar({ userId: tenantOwners, tipo: 'template_aprovado' | 'template_rejeitado', ... })`
- [ ] Task 3: Template library API (AC: #5, #6)
  - [ ] Add `GET /template-library` route — returns all `is_global = true` records (no auth restriction beyond tenant session; library is global)
  - [ ] Optionally filter by `?categoria_ocasiao=carrinho_abandonado`
  - [ ] In `apps/api/src/routes/templates/index.ts`, add this endpoint
- [ ] Task 4: Template library UI (AC: #5, #6, #7)
  - [ ] Create `apps/dashboard/app/(shell)/templates/biblioteca/page.tsx`
  - [ ] Grid layout: each card shows title, description, category chip, and "Usar este modelo" button
  - [ ] "Usar este modelo" navigates to `/templates/new?library={id}` — new template form reads `?library` param and pre-fills from library entry
  - [ ] Update `apps/dashboard/app/(shell)/templates/new/page.tsx` to handle `?library` query param
  - [ ] Add "Biblioteca" tab/link in the Templates section navigation
  - [ ] Update templates list page to show status filter tabs (All / Rascunho / Pendente / Aprovado / Rejeitado)
  - [ ] Status badges with correct color-coding per AC #7
- [ ] Task 5: Tests (AC: #2, #3, #4)
  - [ ] Unit: `handle-template-status-update` updates status to `aprovado` and triggers notification
  - [ ] Unit: `handle-template-status-update` stores `motivo_rejeicao` on rejection
  - [ ] Unit: unknown `meta_template_id` → logs warning, returns without throwing
  - [ ] Integration: POST to `/webhooks/meta` with `message_template_status_update` payload → template status updated in DB

## Dev Notes

- Files to create: `packages/db/src/seeds/template-library.ts`, `apps/api/src/use-cases/templates/handle-template-status-update.ts`, `apps/dashboard/app/(shell)/templates/biblioteca/page.tsx`.
- Files to modify: `packages/db/src/schema/template.ts` (add `template_library` table), `apps/api/src/routes/webhooks/meta.ts` (add `message_template_status_update` handler), `apps/api/src/routes/templates/index.ts` (add library endpoint), `apps/dashboard/app/(shell)/templates/new/page.tsx` (handle `?library` param), `apps/dashboard/app/(shell)/templates/page.tsx` (add status filter).
- **Seed library content** (8 entries — use these as the basis):
  1. `categoria_ocasiao: boas_vindas` — "Boas-vindas" — greeting message for new leads
  2. `categoria_ocasiao: carrinho_abandonado_1h` — "Carrinho Abandonado (1h)" — urgency recovery 1 hour after abandonment
  3. `categoria_ocasiao: carrinho_abandonado_6h` — "Carrinho Abandonado (6h)" — softer follow-up at 6 hours
  4. `categoria_ocasiao: carrinho_abandonado_24h` — "Carrinho Abandonado (24h)" — last reminder at 24 hours
  5. `categoria_ocasiao: ultima_chamada` — "Última Chamada" — cart closing urgency template
  6. `categoria_ocasiao: pos_compra` — "Pós-compra" — congratulations + next steps
  7. `categoria_ocasiao: reengajamento` — "Reengajamento" — reconnect with inactive leads
  8. `categoria_ocasiao: lembrete_evento` — "Lembrete de Evento" — event/webinar reminder
- Meta webhook payload structure for `message_template_status_update`: `{ "entry": [{ "changes": [{ "value": { "event": "APPROVED|REJECTED", "message_template_id": 123, "reason": "..." }, "field": "message_template_status_update" }] }] }`. The `message_template_id` from Meta is a numeric ID — store as text in `templates.meta_template_id`.
- The notification for template approval/rejection should use the Epic 18 notification service when available. For now, wire a placeholder call that can be activated later.
- `template_library` does not need RLS — it is global, read-only data managed by Exponensia (no tenant-specific rows in V1).

### Testing standards

- Unit tests: Vitest, mocked DB + notification service. Test all 4 Meta status transitions.
- Integration: POST a simulated `message_template_status_update` webhook and verify `templates.status` updated.

### Pitfalls to avoid

- Meta sends `message_template_id` as a **number** in the webhook, but it's stored as text in the DB — convert before lookup.
- Do NOT fail the webhook if the template is not found — this will cause Meta to retry indefinitely.
- Template library seed must be idempotent — running it twice should not create duplicates.
- The Meta webhook endpoint already exists from Story 4.4 — add the new event type as a new case in the existing dispatcher, do NOT create a separate webhook route.

### References

- [Source: docs/01-leedi-arquitetura.md#6.9 Domínio Template]
- [Source: _bmad-output/planning-artifacts/epics.md#Story 12.2]
- [Source: _bmad-output/implementation-artifacts/12-1-template-builder-meta-submission.md] (templates table, Meta adapter)
- [Source: _bmad-output/implementation-artifacts/4-4-inbound-webhook-message-reception-routing.md] (Meta webhook handler — add new event type here)
- [Source: _bmad-output/implementation-artifacts/18-1-notification-infrastructure-push-email.md] (notification service — wire when available)

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
