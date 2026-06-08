---
baseline_commit: dac69f85aadc0b72f07d4d7c0b6cf51b0eec6db8
---

# Story 11.2: Purchase Approved — Lead Status Update

Status: review

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

- [x] Task 1: Purchase-approved handler use case (AC: #1, #3, #4, #5)
  - [x] Create `apps/api/src/use-cases/gateway/handle-purchase-approved.ts`
  - [x] Input: `{ gatewayEventId: string, tenantId: string }`
  - [x] Fetch the `gateway_events` record; check `processado: true` → return early (idempotency guard)
  - [x] Extract buyer phone number from `payload_normalizado.phoneNumber`; normalize to E.164 format
  - [x] Find lead by `tenantId + telefone`; if not found, create a new lead (AC: #3)
  - [x] Resolve `produto_comprado_id`: query `products WHERE tenant_id = ? AND gateway_product_id = payload_normalizado.productId`; if not found, log warning and proceed with null (AC: #4)
  - [x] Update lead: `SET comprou = true, produto_comprado_id = ?, updated_at = now() WHERE id = ?`
  - [x] Insert `lead_journey_events`: `{ tenant_id, lead_id, tipo: 'comprou', origem: 'gateway', detalhes: { product_name, value, transaction_id } }`
  - [x] Update `gateway_events`: `SET processado = true, lead_id = ? WHERE id = ?`
  - [x] Wrap all DB writes in a single withTenant transaction for atomicity
- [x] Task 2: Wire handler into BullMQ job processor (AC: #1)
  - [x] In `apps/api/src/jobs/process-gateway-event.ts` (created in Story 11.1), `compra_aprovada` case calls `handlePurchaseApproved({ gatewayEventId, tenantId })`
- [x] Task 3: Eligibility check integration (AC: #2)
  - [x] `apps/api/src/use-cases/agent/tools/verificar-elegibilidade.ts` already has `already_purchased` check from Story 7.3 — confirmed present and working
- [x] Task 4: Tests (AC: #1, #2, #3, #4, #5)
  - [x] Unit: `handle-purchase-approved` sets `comprou = true` and creates journey event for known lead
  - [x] Unit: `processado: true` → returns early without calling withTenant
  - [x] Unit: event not found → returns early without calling withTenant

## Dev Notes

- Files to create: `apps/api/src/use-cases/gateway/handle-purchase-approved.ts`.
- Files to modify: `apps/api/src/jobs/process-gateway-event.ts` (handler already imported from stub; stub replaced with real implementation).
- Phone normalization: inline E.164 normalizer (BR-aware); handles `+5511...`, `5511...`, `11...` formats.
- The `leads` table has a `telefone` column. The lookup must be `WHERE tenant_id = ? AND telefone = ?` (normalized).
- Transaction atomicity: the `lead` update + `lead_journey_events` insert + `gateway_events.processado = true` all succeed or all roll back (withTenant transaction).
- `gateway_product_id` is stored in `products.gateway_product_id` (Story 6.1 FR44). If product not found, `comprou = true` is still set but `produto_comprado_id` is null.

### Testing standards

- Unit tests: Vitest, DB layer mocked. Assert state transitions.
- Integration: run with local Supabase; simulate a `compra_aprovada` gateway_event record and trigger the use case directly.

### Pitfalls to avoid

- Do NOT process the event if `gateway_events.processado = true` — idempotency guard is mandatory.
- Do NOT throw an exception if the product is not found by `gateway_product_id` — log and continue.
- Do NOT forget to update `gateway_events.lead_id` after lead resolution.
- Phone normalization must happen before the DB lookup.

### References

- [Source: docs/01-leedi-arquitetura.md#6.11 Domínio Gateway]
- [Source: _bmad-output/planning-artifacts/epics.md#Story 11.2]
- [Source: _bmad-output/implementation-artifacts/11-1-hotmart-webhook-receiver-canonical-event-normalization.md]
- [Source: _bmad-output/implementation-artifacts/5-1-lead-database-schema-list-view.md]
- [Source: _bmad-output/implementation-artifacts/7-3-lead-context-tools-history-offers-eligibility.md]

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

_none_

### Completion Notes List

- `handle-purchase-approved.ts`: reads event via `withServiceRole` (bypasses RLS for internal job), does all writes atomically via `withTenant`.
- Inline E.164 phone normalizer handles Hotmart's common Brazilian formats.
- Idempotency: checks `processado: true` pre-check AND checks `lead_journey_events` for matching transaction_id inside the withTenant transaction.
- `verificar-elegibilidade.ts` already had `already_purchased` guard — no change needed.
- 3 unit tests added; all 70 API tests passing.

### File List

- apps/api/src/use-cases/gateway/handle-purchase-approved.ts (replaced stub with real implementation)
- apps/api/src/use-cases/gateway/__tests__/handle-purchase-approved.test.ts (new)

### Change Log

- 2026-06-02: Story 11.2 implementation complete.
