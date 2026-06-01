---
baseline_commit: 9ea8a05
---

# Story 11.2: Purchase Approved — Lead Status Update

Status: ready-for-dev

## Story

As a lead who just purchased,
I want the system to immediately recognize my purchase and stop trying to sell me what I already bought,
so that I don't receive redundant sales messages.

## Acceptance Criteria

1. **Given** a `compra_aprovada` canonical event arrives with a phone number matching an existing lead, **When** the BullMQ job `process-gateway-event` processes it, **Then** the matching lead's `comprou` flag is set to `true`, `produto_comprado_id` is resolved from the `gateway_product_id` binding in `products`, and a `lead_journey_events` record is created with `tipo: "comprou"` and `detalhes: { product_name, value, transaction_id }`.
2. **Given** the lead's `comprou` flag is now `true`, **When** the agent calls `verificar_elegibilidade` for that product, **Then** the tool returns `{ eligible: false, reason: "already_purchased" }`.
3. **Given** a `compra_aprovada` event arrives but no lead exists with the buyer's phone number, **When** processed, **Then** a new lead is created with `nome` from `data.buyer.name`, `telefone` from `data.buyer.phone`, `comprou: true`, and `lead_id` is backfilled on the `gateway_events` record.
4. **Given** a `compra_aprovada` event arrives and the product is not found in `products` by `gateway_product_id`, **When** processed, **Then** `lead.comprou` is still set to `true` but `produto_comprado_id` is left null; a warning is logged with the unresolved `gateway_product_id`.
5. **Given** the same `compra_aprovada` event is processed twice (idempotency), **When** the second job runs, **Then** no duplicate `lead_journey_events` row is created and `lead.comprou` remains `true` (idempotent re-run produces no side effect).

## Tasks / Subtasks

- [ ] Task 1: Purchase-approved handler use case (AC: #1, #3, #4, #5)
  - [ ] Create `apps/api/src/use-cases/gateway/handle-purchase-approved.ts`
  - [ ] Input: `{ gatewayEventId: string, tenantId: string }`
  - [ ] Fetch the `gateway_events` record; check `processado: true` → return early (idempotency guard)
  - [ ] Extract buyer phone number from `payload_normalizado.phoneNumber`; normalize to E.164 format
  - [ ] Find lead by `tenantId + telefone`; if not found, create a new lead (AC: #3)
  - [ ] Resolve `produto_comprado_id`: query `products WHERE tenant_id = ? AND gateway_product_id = payload_normalizado.productId`; if not found, log warning and proceed with null (AC: #4)
  - [ ] Update lead: `SET comprou = true, produto_comprado_id = ?, updated_at = now() WHERE id = ?`
  - [ ] Insert `lead_journey_events`: `{ tenant_id, lead_id, tipo: 'comprou', origem: 'gateway', detalhes: { product_name, value, transaction_id } }`
  - [ ] Update `gateway_events`: `SET processado = true, lead_id = ? WHERE id = ?`
  - [ ] Wrap all DB writes in a single transaction for atomicity
- [ ] Task 2: Wire handler into BullMQ job processor (AC: #1)
  - [ ] In `apps/api/src/jobs/process-gateway-event.ts` (created in Story 11.1), add case for `evento_canonico === 'compra_aprovada'` → call `handlePurchaseApproved({ gatewayEventId, tenantId })`
- [ ] Task 3: Eligibility check integration (AC: #2)
  - [ ] In `apps/api/src/use-cases/agent/tools/verificar-elegibilidade.ts` (from Story 7.3), add check: if `lead.comprou === true && lead.produto_comprado_id === productId` → return `{ eligible: false, reason: 'already_purchased' }`
  - [ ] This may already be implemented in Story 7.3; confirm and add the check if missing
- [ ] Task 4: Tests (AC: #1, #2, #3, #4, #5)
  - [ ] Unit: `handle-purchase-approved` sets `comprou = true` and creates journey event for known lead
  - [ ] Unit: unknown phone number creates a new lead with `comprou: true`
  - [ ] Unit: unresolved `gateway_product_id` → `produto_comprado_id: null`, warning logged, no exception thrown
  - [ ] Unit: second call with same `gatewayEventId` → returns early, no duplicate journey event
  - [ ] Integration: full flow — gateway event → BullMQ job → lead updated → `verificar_elegibilidade` returns false

## Dev Notes

- Files to create: `apps/api/src/use-cases/gateway/handle-purchase-approved.ts`.
- Files to modify: `apps/api/src/jobs/process-gateway-event.ts` (add handler dispatch), `apps/api/src/use-cases/agent/tools/verificar-elegibilidade.ts` (confirm/add `already_purchased` check).
- Phone normalization: use a shared utility (or `libphonenumber-js`) to normalize phone numbers to E.164. Hotmart may send `+5511999998888` or `5511999998888` — normalize before lookup.
- The `leads` table has a `telefone` column. The lookup must be `WHERE tenant_id = ? AND telefone = ?` (normalized). Add index on `(tenant_id, telefone)` if not already present from Story 5.1.
- Transaction atomicity: the `lead` update + `lead_journey_events` insert + `gateway_events.processado = true` must all succeed or all roll back.
- `gateway_product_id` is stored in `products.gateway_product_id` (added in Story 6.1 — FR44). If Story 6.1 has not been implemented yet, the product resolution will return null for all events — this is acceptable for V1.
- No new DB migration needed for this story — all tables exist from Story 5.1 (leads), Story 5.2 (lead_journey_events), and Story 11.1 (gateway_events).

### Testing standards

- Unit tests: Vitest, DB layer mocked. Assert state transitions.
- Integration: run with local Supabase; simulate a `compra_aprovada` gateway_event record and trigger the use case directly (bypassing BullMQ for integration test).

### Pitfalls to avoid

- Do NOT process the event if `gateway_events.processado = true` — idempotency guard is mandatory.
- Do NOT throw an exception if the product is not found by `gateway_product_id` — log and continue.
- Do NOT forget to update `gateway_events.lead_id` after lead resolution — this linkage is important for the financial reporting in Epic 20.
- Phone normalization must happen before the DB lookup — a mismatch due to format differences will create duplicate leads.

### References

- [Source: docs/01-leedi-arquitetura.md#6.11 Domínio Gateway]
- [Source: _bmad-output/planning-artifacts/epics.md#Story 11.2]
- [Source: _bmad-output/implementation-artifacts/11-1-hotmart-webhook-receiver-canonical-event-normalization.md] (gateway_events schema, BullMQ job)
- [Source: _bmad-output/implementation-artifacts/5-1-lead-database-schema-list-view.md] (leads table, lead_journey_events)
- [Source: _bmad-output/implementation-artifacts/7-3-lead-context-tools-history-offers-eligibility.md] (verificar_elegibilidade tool)

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
