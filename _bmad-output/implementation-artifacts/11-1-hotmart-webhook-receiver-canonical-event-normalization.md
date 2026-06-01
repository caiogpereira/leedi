---
baseline_commit: 9ea8a05
---

# Story 11.1: Hotmart Webhook Receiver & Canonical Event Normalization

Status: ready-for-dev

## Story

As a developer,
I want a Hotmart webhook endpoint that validates signatures and normalizes events to canonical format,
so that the rest of the system only handles well-defined events regardless of Hotmart's payload format.

## Acceptance Criteria

1. **Given** the DB migration runs, **When** the schema is applied, **Then** tables `gateway_integrations` and `gateway_events` exist with columns matching Architecture §6.11: `gateway_integrations` has (`id` uuid pk, `tenant_id` uuid FK, `gateway` enum `hotmart|eduzz|kiwify`, `webhook_secret` text, `webhook_url_path` text, `config` jsonb, `ativo` bool default true, `created_at`, `updated_at`); `gateway_events` has (`id` uuid pk, `tenant_id` uuid FK, `gateway` text, `evento_canonico` enum of 11 canonical types, `payload_original` jsonb, `payload_normalizado` jsonb, `lead_id` uuid FK nullable, `processado` bool default false, `created_at`). RLS enabled on both with tenant isolation.
2. **Given** Hotmart sends a webhook POST to `/webhooks/hotmart/{webhookUrlPath}` with valid `hottok` query parameter, **When** received, **Then** the endpoint responds `200 OK` immediately, stores the raw payload in `gateway_events.payload_original`, maps `evento_canonico` to the matching canonical type, and stores the normalized payload in `payload_normalizado`.
3. **Given** Hotmart sends a webhook with an invalid or missing `hottok`, **When** received, **Then** it responds `401 Unauthorized` and the event is not persisted.
4. **Given** the same Hotmart event ID (`data.purchase.transaction` or `data.id`) is received a second time, **When** the second webhook arrives, **Then** `gateway_events` already has a record with matching `payload_original.data.purchase.transaction` → the duplicate is detected and discarded; the endpoint still returns `200 OK` (idempotency).
5. **Given** a Hotmart event type is not in the supported canonical list, **When** received, **Then** the event is stored with `evento_canonico: null` and `processado: false`, and a warning is logged — but the endpoint returns `200 OK` to prevent Hotmart retries.
6. **Given** the `@leedi/gateway` package exports a `HotmartNormalizer` class, **When** given a raw Hotmart payload, **Then** it returns a canonical `GatewayEvent` object with the correct `evento_canonico` for each of the 11 event types: `compra_aprovada`, `compra_recusada`, `compra_cancelada`, `compra_reembolsada`, `chargeback`, `carrinho_abandonado`, `assinatura_iniciada`, `assinatura_cancelada`, `assinatura_atrasada`, `boleto_gerado`, `pix_gerado`.

## Tasks / Subtasks

- [ ] Task 1: DB schema + migration (AC: #1)
  - [ ] Create `packages/db/src/schema/gateway.ts`
  - [ ] Define `pgEnum('gateway_type', ['hotmart', 'eduzz', 'kiwify'])`
  - [ ] Define `pgEnum('gateway_evento_canonico', ['compra_aprovada', 'compra_recusada', 'compra_cancelada', 'compra_reembolsada', 'chargeback', 'carrinho_abandonado', 'assinatura_iniciada', 'assinatura_cancelada', 'assinatura_atrasada', 'boleto_gerado', 'pix_gerado'])`
  - [ ] Define `gateway_integrations` table: `id` (uuid pk defaultRandom), `tenantId` (uuid FK → `tenants.id` notNull, column `tenant_id`), `gateway` (gatewayTypeEnum notNull), `webhookSecret` (text notNull, column `webhook_secret`), `webhookUrlPath` (text notNull unique, column `webhook_url_path`), `config` (jsonb notNull default `{}`), `ativo` (bool notNull default true), `createdAt`, `updatedAt`
  - [ ] Define `gateway_events` table: `id` (uuid pk defaultRandom), `tenantId` (uuid FK notNull, column `tenant_id`), `gateway` (text notNull), `eventoCanonical` (gatewayEventoCanonicoEnum nullable, column `evento_canonico`), `payloadOriginal` (jsonb notNull, column `payload_original`), `payloadNormalizado` (jsonb notNull default `{}`, column `payload_normalizado`), `leadId` (uuid FK → `leads.id` nullable, column `lead_id`), `processado` (bool notNull default false), `createdAt` (timestamptz notNull default now(), column `created_at`)
  - [ ] Generate migration via Drizzle Kit — confirm next free slot in `_journal.json` is 0010 (after: 0005=leads, 0006=messaging, 0007=knowledge, 0008=agent, 0009=campaign); use 0010 for gateway.
  - [ ] In migration SQL: `ENABLE ROW LEVEL SECURITY` + `FORCE ROW LEVEL SECURITY` on both tables; tenant isolation policy; add unique constraint on `gateway_events (payload_original->>'$.data.purchase.transaction')` — or implement deduplication at application layer using `payload_original` lookup before insert.
  - [ ] Add `updated_at` trigger on `gateway_integrations` only (`gateway_events` is append-only).
  - [ ] Re-export `gateway` schema from `packages/db/src/schema/index.ts`
- [ ] Task 2: `@leedi/gateway` domain package (AC: #6)
  - [ ] Create `packages/gateway/src/index.ts` — public exports: `HotmartNormalizer`, `GatewayEvent` type, `GatewayEventoCanonical` enum
  - [ ] Create `packages/gateway/src/normalizers/hotmart.ts` — `HotmartNormalizer.normalize(payload): GatewayEvent`
  - [ ] Map Hotmart `event` field to canonical enum:
    - `PURCHASE_APPROVED` → `compra_aprovada`
    - `PURCHASE_PROTEST` / `PURCHASE_CANCELED` → `compra_cancelada`
    - `PURCHASE_REFUNDED` → `compra_reembolsada`
    - `PURCHASE_CHARGEBACK` → `chargeback`
    - `PURCHASE_BILLET_PRINTED` → `boleto_gerado`
    - `PURCHASE_COMPLETE` → `compra_aprovada` (same as APPROVED for Hotmart)
    - `CART_ABANDONED` → `carrinho_abandonado`
    - `SUBSCRIPTION_STARTED` → `assinatura_iniciada`
    - `SUBSCRIPTION_CANCELED` → `assinatura_cancelada`
    - `SUBSCRIPTION_OVERDUE` → `assinatura_atrasada`
    - PIX events (`PURCHASE_PIX_GENERATED` or equivalent) → `pix_gerado`
  - [ ] Extract canonical fields: `hotmartTransactionId` (from `data.purchase.transaction`), `phoneNumber` (from `data.buyer.phone`), `productId` (from `data.product.id`), `productName`, `value` (from `data.purchase.price.value`)
  - [ ] Add `packages/gateway/package.json` as a proper `@leedi/gateway` workspace package
  - [ ] Add `packages/gateway/tsconfig.json` extending `@leedi/tsconfig/base`
- [ ] Task 3: Webhook endpoint (AC: #2, #3, #4, #5)
  - [ ] Create `apps/api/src/routes/webhooks/hotmart.ts` (Hono route)
  - [ ] Route: `POST /webhooks/hotmart/:webhookUrlPath`
  - [ ] Lookup `gateway_integrations` by `webhookUrlPath`; return `404` if not found
  - [ ] Validate `hottok` query param against `gateway_integrations.webhook_secret`; return `401` on mismatch
  - [ ] Idempotency check: query `gateway_events` for existing record with same Hotmart transaction ID extracted from `payload_original`; if found, skip and return `200 OK`
  - [ ] Call `HotmartNormalizer.normalize(payload)` to get canonical event
  - [ ] Insert `gateway_events` record
  - [ ] If `evento_canonico` is non-null, enqueue BullMQ job `process-gateway-event` with `{ gatewayEventId, tenantId }`
  - [ ] Always return `200 OK` even for unknown event types
  - [ ] Register route in `apps/api/src/app.ts` — outside tenant auth middleware (public endpoint, validated by `hottok`)
- [ ] Task 4: Gateway integration setup use case (AC: #1)
  - [ ] Create `apps/api/src/use-cases/gateway/create-gateway-integration.ts`
  - [ ] Generates a unique `webhookUrlPath` (UUID v4 slug or `hotmart-{tenantId}`)
  - [ ] Used in Onboarding wizard Step 3 (Epic 19) and Settings page; expose via `POST /gateway-integrations`
  - [ ] Return the full webhook URL for display: `{API_BASE_URL}/webhooks/hotmart/{webhookUrlPath}`
- [ ] Task 5: BullMQ job scaffold for event processing (AC: #2, #6)
  - [ ] Create `apps/api/src/jobs/process-gateway-event.ts` — BullMQ job processor scaffold
  - [ ] Job receives `{ gatewayEventId, tenantId }`; fetches event from DB, delegates to the appropriate handler based on `evento_canonico` (Stories 11.2 and 11.3 fill these handlers)
  - [ ] For Story 11.1 scope: just log the event type and mark `processado: false` (handlers added in 11.2/11.3)
  - [ ] Register the worker in the BullMQ bootstrap
- [ ] Task 6: Tests (AC: #2, #3, #4, #5, #6)
  - [ ] Unit: `HotmartNormalizer.normalize()` maps all 11 event types correctly
  - [ ] Unit: unknown Hotmart event type returns `evento_canonico: null`
  - [ ] Integration: POST /webhooks/hotmart with valid hottok → event stored in DB
  - [ ] Integration: POST with invalid hottok → 401, no DB insert
  - [ ] Integration: duplicate transaction ID → 200 OK, no second insert (idempotency)

## Dev Notes

- Files to create: `packages/gateway/src/index.ts`, `packages/gateway/src/normalizers/hotmart.ts`, `packages/gateway/package.json`, `packages/gateway/tsconfig.json`, migration file (0010), `apps/api/src/routes/webhooks/hotmart.ts`, `apps/api/src/use-cases/gateway/create-gateway-integration.ts`, `apps/api/src/jobs/process-gateway-event.ts`.
- Files to modify: `packages/db/src/schema/index.ts` (re-export), `apps/api/src/app.ts` (register webhook route), `packages/db/package.json` (ensure gateway schema included), `pnpm-workspace.yaml` (if `packages/gateway` is new).
- Hotmart webhook validation: Hotmart sends a `hottok` query parameter matching the `webhook_secret` configured when registering the webhook URL. There is no X-Hub-Signature-256 equivalent — validation is purely via `hottok`.
- The webhook URL path must be unguessable. Prefer `webhookUrlPath = crypto.randomUUID()` over sequential IDs.
- `gateway_events` is append-only: no updates after insert (except `processado` flag set by event processors in 11.2/11.3). Do NOT add `updated_at` trigger.
- Idempotency implementation: before inserting a new event, check `SELECT id FROM gateway_events WHERE tenant_id = ? AND payload_original->>'data' ->> 'purchase' ->> 'transaction' = ?`. If found, skip. Alternatively, add a unique index on a computed column — but application-layer check is simpler for V1.
- `lead_id` in `gateway_events` is resolved at processing time (Stories 11.2/11.3) by matching the buyer's phone number against the `leads` table.
- npm dependencies: `bullmq` (already present), no new external packages needed.

### Testing standards

- Unit tests: Vitest, no DB. `HotmartNormalizer` tested with fixture payloads (one per canonical event type).
- Integration: local Supabase with migration 0010 applied; test with curl or supertest against the Hono webhook route.

### Pitfalls to avoid

- Do NOT apply auth middleware to `/webhooks/hotmart/*` — it must be public. Validate only via `hottok`.
- Do NOT silently drop unknown event types — store them with `evento_canonico: null` so nothing is lost.
- Do NOT process the event synchronously in the webhook handler — always enqueue to BullMQ and respond immediately.
- Hotmart may send `PURCHASE_COMPLETE` and `PURCHASE_APPROVED` for the same transaction — both map to `compra_aprovada`; idempotency check must cover this.
- Confirm migration number 0010 is free in `_journal.json` at implementation time.

### Project Structure Notes

- New package: `packages/gateway/`. Follows the same pattern as `packages/connection/`.
- Webhook route lives in `apps/api`, not in `packages/gateway` — the package is pure domain logic (normalizer, types).

### References

- [Source: docs/01-leedi-arquitetura.md#6.11 Domínio Gateway]
- [Source: _bmad-output/planning-artifacts/epics.md#Story 11.1]
- [Source: _bmad-output/implementation-artifacts/4-4-inbound-webhook-message-reception-routing.md] (webhook validation + idempotency pattern)
- [Source: _bmad-output/implementation-artifacts/10-1-campaign-crud-phase-schema.md] (migration + RLS pattern)

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
