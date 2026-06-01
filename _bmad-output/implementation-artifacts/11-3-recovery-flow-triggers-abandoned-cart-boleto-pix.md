---
baseline_commit: 9ea8a05
---

# Story 11.3: Recovery Flow Triggers (Abandoned Cart, Boleto, Pix)

Status: ready-for-dev

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

- [ ] Task 1: Recovery event handler use case (AC: #1, #2)
  - [ ] Create `apps/api/src/use-cases/gateway/handle-recovery-event.ts`
  - [ ] Handles: `carrinho_abandonado`, `boleto_gerado`, `pix_gerado`
  - [ ] Same lead resolution logic as Story 11.2 (find by phone, create if not found)
  - [ ] Insert `lead_journey_events` with the matching `tipo` string
  - [ ] Query `dispatch_rules WHERE tenant_id = ? AND trigger = ? AND ativo = true`; if found, enqueue a BullMQ delayed job `dispatch-recovery-target` with `{ leadId, dispatchRuleId, tenantId, scheduledFor: now() + janela_tempo }` — this job is processed by the dispatch worker (Story 13.2 / 13.3)
  - [ ] Update `gateway_events.processado = true` and `lead_id`
  - [ ] Wrap in a transaction
- [ ] Task 2: Cancellation/refund handler use case (AC: #3, #4)
  - [ ] Create `apps/api/src/use-cases/gateway/handle-cancellation.ts`
  - [ ] Handles: `compra_cancelada`, `compra_reembolsada`, `chargeback`
  - [ ] Idempotency guard: check `gateway_events.processado`
  - [ ] Lead resolution (same pattern as 11.2)
  - [ ] Update lead: `SET comprou = false, produto_comprado_id = null, updated_at = now()`
  - [ ] Insert `lead_journey_events` with correct `tipo` for each event type
  - [ ] Update `gateway_events.processado = true`
- [ ] Task 3: Wire handlers into BullMQ job processor (AC: #1, #2, #3, #4)
  - [ ] In `apps/api/src/jobs/process-gateway-event.ts`, add cases:
    - `carrinho_abandonado | boleto_gerado | pix_gerado` → `handleRecoveryEvent`
    - `compra_cancelada | compra_reembolsada | chargeback` → `handleCancellation`
    - `compra_recusada` → create journey event `tipo: "compra_recusada"`, no dispatch trigger
    - `assinatura_iniciada | assinatura_cancelada | assinatura_atrasada` → create journey events (no further action in V1)
- [ ] Task 4: Tests (AC: #1, #2, #3, #5, #6)
  - [ ] Unit: `handle-recovery-event` creates journey event for known and unknown leads
  - [ ] Unit: `handle-recovery-event` enqueues dispatch target when matching active rule exists
  - [ ] Unit: `handle-recovery-event` does NOT enqueue when no matching rule exists
  - [ ] Unit: `handle-cancellation` reverts `comprou = false` and creates correct journey event
  - [ ] Unit: duplicate event with `processado = true` → returns early, no duplicate
  - [ ] Integration: full flow — Hotmart abandonment event → journey event in DB + dispatch target queued

## Dev Notes

- Files to create: `apps/api/src/use-cases/gateway/handle-recovery-event.ts`, `apps/api/src/use-cases/gateway/handle-cancellation.ts`.
- Files to modify: `apps/api/src/jobs/process-gateway-event.ts` (add all remaining event type handlers).
- **Dependency on Story 13.3**: `dispatch_rules` table and the `dispatch-recovery-target` BullMQ job are defined in Story 13.3. For Story 11.3 scope, enqueue the BullMQ job with a queue name (`dispatch-recovery-target`) — even if the worker is not yet live, the job will wait in the queue. Alternatively, gate the enqueueing with a try/catch so a missing dispatch rule doesn't block event processing.
- The `janela_tempo` jsonb in `dispatch_rules` is structured as `{ delay_minutes: number }`. At processing time, compute `scheduledFor = now() + delay_minutes minutes`. If the rule's `janela_tempo` is not set, default to 60 minutes.
- `tipo` values for `lead_journey_events`: use string constants matching the canonical event names for consistency: `"carrinho_abandonado"`, `"boleto_gerado"`, `"pix_gerado"`, `"compra_cancelada"`, `"compra_reembolsada"`, `"chargeback"`, `"compra_recusada"`, `"assinatura_iniciada"`, `"assinatura_cancelada"`, `"assinatura_atrasada"`.
- No new DB migration needed — all tables exist from Stories 5.1 (lead_journey_events), 11.1 (gateway_events).

### Testing standards

- Unit tests: Vitest, mocked DB. Test all canonical event types in the switch/case dispatcher.
- Integration: local Supabase; trigger each handler directly with mock payload and verify DB state.

### Pitfalls to avoid

- Do NOT block event processing if the dispatch worker is not available — enqueueing to BullMQ should be fire-and-forget with graceful error handling.
- Do NOT create duplicate `lead_journey_events` on retry — use `gateway_events.processado` guard BEFORE all writes.
- `compra_recusada` should NOT trigger a recovery dispatch (it means payment was declined, not abandoned) — only `carrinho_abandonado`, `boleto_gerado`, `pix_gerado` trigger recovery.
- Reverting `comprou = false` on cancellation does NOT re-enable the agent to sell the product again in a predictable way — the agent's next message will naturally re-offer if `verificar_elegibilidade` returns eligible. No special agent notification needed.

### References

- [Source: docs/01-leedi-arquitetura.md#6.11 Domínio Gateway]
- [Source: _bmad-output/planning-artifacts/epics.md#Story 11.3]
- [Source: _bmad-output/implementation-artifacts/11-1-hotmart-webhook-receiver-canonical-event-normalization.md] (gateway_events, BullMQ job)
- [Source: _bmad-output/implementation-artifacts/11-2-purchase-approved-lead-status-update.md] (lead resolution pattern)
- [Source: _bmad-output/implementation-artifacts/5-1-lead-database-schema-list-view.md] (lead_journey_events)

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
