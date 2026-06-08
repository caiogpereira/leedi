---
baseline_commit: a20353c5aadc0b72f07d4d7c0b6cf51b0eec6db8
---

# Story 11.3: Recovery Flow Triggers (Abandoned Cart, Boleto, Pix)

Status: review

## Story

As a tenant owner,
I want abandoned cart, boleto, and pix events to automatically trigger recovery flows,
so that leads who showed purchase intent but didn't complete are re-engaged automatically.

## Acceptance Criteria

1. **Given** a `carrinho_abandonado` canonical event arrives with a phone matching an existing lead, **When** processed, **Then** a `lead_journey_events` record is created with `tipo: "carrinho_abandonado"` and `detalhes: { product_name, transaction_id }`; and if a `dispatch_rules` record exists with `trigger = 'carrinho_abandonado'` and `ativo = true` for that tenant, a dispatch target is queued for that lead.
2. **Given** a `boleto_gerado` or `pix_gerado` event arrives, **When** processed, **Then** a `lead_journey_events` record is created with `tipo: "boleto_gerado"` or `"pix_gerado"`; and if a matching active dispatch rule exists for that trigger type, a dispatch target is queued.
3. **Given** a `compra_cancelada` or `compra_reembolsada` event arrives with a matching lead, **When** processed, **Then** the lead's `comprou` flag is reverted to `false`, `produto_comprado_id` is set to `null`, and a `lead_journey_events` record is created with `tipo: "compra_cancelada"` or `"compra_reembolsada"`.
4. **Given** a `chargeback` event arrives, **When** processed, **Then** it is treated the same as `compra_cancelada` — lead status reverted and journey event created with `tipo: "chargeback"`.
5. **Given** any recovery event arrives but no lead exists with the buyer's phone, **When** processed, **Then** a new lead is created with the buyer's data and the journey event is attached to the new lead.
6. **Given** the same event is processed twice, **When** the second job runs, **Then** no duplicate journey event is created and no second dispatch target is queued (idempotency via `gateway_events.processado` check).
7. **Given** a lead purchases before the dispatch rule trigger fires, **When** the queued dispatch target is about to be sent, **Then** the dispatch target's status is set to `excluido` with `motivo_exclusao: "ja_comprou"` and the message is NOT sent. *(This behavior is enforced at dispatch execution time in Story 13.2; this story ensures the dispatch target is correctly queued and lead status is accurately maintained.)*

## Tasks / Subtasks

- [x] Task 1: Recovery event handler use case (AC: #1, #2)
  - [x] Create `apps/api/src/use-cases/gateway/handle-recovery-event.ts`
  - [x] Handles: `carrinho_abandonado`, `boleto_gerado`, `pix_gerado`
  - [x] Same lead resolution logic as Story 11.2 (find by phone, create if not found)
  - [x] Insert `lead_journey_events` with the matching `tipo` string
  - [x] Query `dispatch_rules WHERE tenant_id = ? AND trigger = ? AND ativo = true` via raw SQL (table created in Story 13.3); wrapped in try/catch so missing table doesn't block event processing
  - [x] If found, enqueue QStash delayed job `dispatch-recovery-target` with `{ leadId, dispatchRuleId, tenantId, scheduledFor: now() + janela_tempo }`
  - [x] Update `gateway_events.processado = true` and `lead_id`
  - [x] Wrapped in withTenant transaction
- [x] Task 2: Cancellation/refund handler use case (AC: #3, #4)
  - [x] Create `apps/api/src/use-cases/gateway/handle-cancellation.ts`
  - [x] Handles: `compra_cancelada`, `compra_reembolsada`, `chargeback`
  - [x] Idempotency guard: check `gateway_events.processado`
  - [x] Lead resolution (same pattern as 11.2)
  - [x] Update lead: `SET comprou = false, produto_comprado_id = null, updated_at = now()`
  - [x] Insert `lead_journey_events` with correct `tipo` for each event type
  - [x] Update `gateway_events.processado = true`
- [x] Task 3: Wire handlers into BullMQ job processor (AC: #1, #2, #3, #4)
  - [x] In `apps/api/src/jobs/process-gateway-event.ts`, all cases wired:
    - `carrinho_abandonado | boleto_gerado | pix_gerado` → `handleRecoveryEvent`
    - `compra_cancelada | compra_reembolsada | chargeback` → `handleCancellation`
    - `compra_recusada | assinatura_*` → `handleJourneyEventOnly` (creates journey event, no dispatch)
- [x] Task 4: Tests (AC: #1, #2, #3, #5, #6)
  - [x] Unit: `handle-recovery-event` creates journey event for known lead on `carrinho_abandonado`
  - [x] Unit: `handle-recovery-event` returns early when processado = true
  - [x] Unit: `handle-recovery-event` creates new lead when phone not found
  - [x] Unit: `handle-cancellation` reverts `comprou = false` and creates correct journey event
  - [x] Unit: `handle-cancellation` returns early when processado = true

## Dev Notes

- Files to create: `apps/api/src/use-cases/gateway/handle-recovery-event.ts`, `apps/api/src/use-cases/gateway/handle-cancellation.ts`.
- Files to modify: `apps/api/src/jobs/process-gateway-event.ts` (add all remaining event type handlers).
- **Dependency on Story 13.3**: `dispatch_rules` table is not yet in the schema. Recovery handler queries it via raw SQL in a try/catch — if table doesn't exist, dispatch is silently skipped.
- QStash delay: `delay = delay_minutes * 60` seconds. Default 60 minutes if `janela_tempo` not set.
- `tipo` values for `lead_journey_events`: string constants matching canonical event names.

### Testing standards

- Unit tests: Vitest, mocked DB. Test all canonical event types in the switch/case dispatcher.
- Integration: local Supabase; trigger each handler directly with mock payload and verify DB state.

### Pitfalls to avoid

- Do NOT block event processing if the dispatch worker is not available — QStash enqueue is fire-and-forget with graceful error handling.
- Do NOT create duplicate `lead_journey_events` on retry — use `gateway_events.processado` guard BEFORE all writes.
- `compra_recusada` should NOT trigger a recovery dispatch — only `carrinho_abandonado`, `boleto_gerado`, `pix_gerado` trigger recovery.

### References

- [Source: docs/01-leedi-arquitetura.md#6.11 Domínio Gateway]
- [Source: _bmad-output/planning-artifacts/epics.md#Story 11.3]
- [Source: _bmad-output/implementation-artifacts/11-1-hotmart-webhook-receiver-canonical-event-normalization.md]
- [Source: _bmad-output/implementation-artifacts/11-2-purchase-approved-lead-status-update.md]
- [Source: _bmad-output/implementation-artifacts/5-1-lead-database-schema-list-view.md]

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

- `dispatch_rules` table doesn't exist yet (Story 13.3 dependency). Used raw SQL with try/catch to gracefully skip dispatch when table is missing.

### Completion Notes List

- `handle-recovery-event.ts`: creates journey events for `carrinho_abandonado`, `boleto_gerado`, `pix_gerado`. Attempts dispatch_rules lookup via raw SQL (gracefully skips if table missing).
- `handle-cancellation.ts`: reverts lead `comprou = false`, creates journey events for `compra_cancelada`, `compra_reembolsada`, `chargeback`.
- `handle-journey-event-only.ts`: simple handler for `compra_recusada` and subscription events — creates journey event only, no side effects.
- All switch/case branches in `process-gateway-event.ts` now fully wired.
- 5 unit tests added; all 75 API tests passing (18 gateway + 75 API = 93 total across both packages).

### File List

- apps/api/src/use-cases/gateway/handle-recovery-event.ts (replaced stub with real implementation)
- apps/api/src/use-cases/gateway/handle-cancellation.ts (replaced stub with real implementation)
- apps/api/src/use-cases/gateway/handle-journey-event-only.ts (new)
- apps/api/src/use-cases/gateway/__tests__/handle-recovery-event.test.ts (new)
- apps/api/src/jobs/process-gateway-event.ts (updated — all event types wired including journey-event-only handler)

### Change Log

- 2026-06-02: Story 11.3 implementation complete.
