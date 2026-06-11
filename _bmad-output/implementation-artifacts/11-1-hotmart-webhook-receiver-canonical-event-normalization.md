---
baseline_commit: 992b842
---

# Story 11.1: Hotmart Webhook Receiver & Canonical Event Normalization

Status: done

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

- [x] Task 1: DB schema + migration (AC: #1)
  - [x] Create `packages/db/src/schema/gateway.ts`
  - [x] Define `pgEnum('gateway_type', ['hotmart', 'eduzz', 'kiwify'])`
  - [x] Define `pgEnum('gateway_evento_canonico', ['compra_aprovada', 'compra_recusada', 'compra_cancelada', 'compra_reembolsada', 'chargeback', 'carrinho_abandonado', 'assinatura_iniciada', 'assinatura_cancelada', 'assinatura_atrasada', 'boleto_gerado', 'pix_gerado'])`
  - [x] Define `gateway_integrations` table: `id` (uuid pk defaultRandom), `tenantId` (uuid FK → `tenants.id` notNull, column `tenant_id`), `gateway` (gatewayTypeEnum notNull), `webhookSecret` (text notNull, column `webhook_secret`), `webhookUrlPath` (text notNull unique, column `webhook_url_path`), `config` (jsonb notNull default `{}`), `ativo` (bool notNull default true), `createdAt`, `updatedAt`
  - [x] Define `gateway_events` table: `id` (uuid pk defaultRandom), `tenantId` (uuid FK notNull, column `tenant_id`), `gateway` (text notNull), `eventoCanonical` (gatewayEventoCanonicoEnum nullable, column `evento_canonico`), `payloadOriginal` (jsonb notNull, column `payload_original`), `payloadNormalizado` (jsonb notNull default `{}`, column `payload_normalizado`), `leadId` (uuid FK → `leads.id` nullable, column `lead_id`), `processado` (bool notNull default false), `createdAt` (timestamptz notNull default now(), column `created_at`)
  - [x] Migration 0011_gateway_schema.sql created; journal entry added
  - [x] In migration SQL: `ENABLE ROW LEVEL SECURITY` + `FORCE ROW LEVEL SECURITY` on both tables; tenant isolation policy; deduplication via application-layer jsonb path lookup
  - [x] Add `updated_at` trigger on `gateway_integrations` only (`gateway_events` is append-only).
  - [x] Re-export `gateway` schema from `packages/db/src/schema/index.ts`
- [x] Task 2: `@leedi/gateway` domain package (AC: #6)
  - [x] Create `packages/gateway/src/index.ts` — public exports: `HotmartNormalizer`, `GatewayEvent` type, `GatewayEventoCanonical` enum
  - [x] Create `packages/gateway/src/normalizers/hotmart.ts` — `HotmartNormalizer.normalize(payload): GatewayEvent`
  - [x] Map Hotmart `event` field to canonical enum (all 13 Hotmart events mapped)
  - [x] Extract canonical fields: `hotmartTransactionId` (from `data.purchase.transaction` with `data.id` fallback), `phoneNumber`, `productId`, `productName`, `value`
  - [x] `packages/gateway/package.json` already existed as workspace package; added test script + vitest devDependency
  - [x] `packages/gateway/tsconfig.json` already existed extending `@leedi/tsconfig/base`
- [x] Task 3: Webhook endpoint (AC: #2, #3, #4, #5)
  - [x] Create `apps/api/src/routes/webhooks/hotmart.ts` (Hono route)
  - [x] Route: `POST /webhooks/hotmart/:webhookUrlPath`
  - [x] Lookup `gateway_integrations` by `webhookUrlPath`; return `404` if not found
  - [x] Validate `hottok` query param against `gateway_integrations.webhook_secret`; return `401` on mismatch
  - [x] Idempotency check: jsonb path query (`data→purchase→transaction` and `data→id` fallback); returns `200 OK` on duplicate
  - [x] Call `HotmartNormalizer.normalize(payload)` to get canonical event
  - [x] Insert `gateway_events` record
  - [x] If `evento_canonico` is non-null, enqueue QStash job `POST /api/internal/gateway/process-event` with `{ gatewayEventId, tenantId }` (QStash, not BullMQ — project architecture decision)
  - [x] Always return `200 OK` even for unknown event types
  - [x] Register route in `apps/api/src/app.ts` — outside tenant auth middleware
- [x] Task 4: Gateway integration setup use case (AC: #1)
  - [x] Create `apps/api/src/use-cases/gateway/create-gateway-integration.ts`
  - [x] Generates unique `webhookUrlPath` (randomUUID) and unique `webhookSecret` (randomUUID)
  - [x] Returns the full webhook URL for display
- [x] Task 5: QStash job scaffold for event processing (AC: #2, #6)
  - [x] Create `apps/api/src/jobs/process-gateway-event.ts` — QStash job processor scaffold
  - [x] Job receives `{ gatewayEventId, tenantId }`; fetches event from DB, delegates to handler stubs
  - [x] Stub files created for 11.2/11.3 handlers (handle-purchase-approved, handle-recovery-event, handle-cancellation)
  - [x] Registered as `POST /api/internal/gateway/process-event` in `internal.ts` (QStash-verified)
- [x] Task 6: Tests (AC: #2, #3, #4, #5, #6)
  - [x] Unit: `HotmartNormalizer.normalize()` maps all 13 Hotmart event types (18 tests, all passing)
  - [x] Unit: unknown Hotmart event type returns `evento_canonico: null`
  - [x] Unit: POST /webhooks/hotmart returns 404 when webhookUrlPath not found
  - [x] Unit: POST with invalid hottok → 401
  - [x] Unit: POST with missing hottok → 401
  - [x] Unit: POST with valid hottok → 200 OK

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

## Review Findings (2026-06-10, code-review)

Reviewed against ACs #1–#6. Migration `0011_gateway_schema.sql`, `gateway.ts` schema, and
`HotmartNormalizer` all match Architecture §6.11. RLS enabled + forced + tenant isolation on both
tables. Normalizer maps all 13 Hotmart event types → 11 canonical types. Webhook validates `hottok`,
responds 200 immediately, fires async via QStash, and stores unknown events with `evento_canonico: null`.
Tests green: 19 gateway unit + webhook route tests passing.

- [x] [Review][Defer] Webhook idempotency is an app-layer SELECT-then-INSERT with no unique index — two concurrent identical webhooks can both pass `isDuplicate` and double-insert [apps/api/src/routes/webhooks/hotmart.ts:100] — deferred, accepted V1 limitation (story Dev Notes), low likelihood; revisit with a unique/computed-column index if duplicates appear in production.
- [x] [Review][Defer] `apiBaseUrl()` derives the API base by `BETTER_AUTH_URL.replace(':3000', …)` — breaks if the URL has no `:3000` (e.g. prod HTTPS without a port) [apps/api/src/routes/webhooks/hotmart.ts:12] — deferred, **project-wide pre-existing pattern** (12+ call sites across epics 11/13/17 + onboarding/webhook-meta), not an Epic 11 defect; should be fixed once globally (pre-launch checklist candidate).

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

- Health test timeout: pre-existing issue exposed by Epic 7/8/10 uncommitted changes (Anthropic SDK import without mock). Fixed by adding `@anthropic-ai/sdk` and `@leedi/gateway` mocks to health.test.ts.
- Project uses QStash (not BullMQ) for async jobs — story spec was stale. Used same QStash + internal-route pattern as campaign-phase-transition.
- Migration slot: story spec said 0010, but confirmed 0010 was already used by campaign_schema. Migration 0011 used instead.

### Completion Notes List

- DB schema: `gateway_integrations` and `gateway_events` tables with enums, RLS policies, and `updated_at` trigger on integrations only.
- `@leedi/gateway` package: `HotmartNormalizer` maps 13 Hotmart event types to 11 canonical types (PURCHASE_REFUSED added, PURCHASE_COMPLETE maps to compra_aprovada). Dedup key uses `data.purchase.transaction ?? data.id` for events without transaction (cart abandoned, subscriptions).
- Webhook route: validates `hottok`, fires async via QStash, logs warning for unknown event types.
- Process-gateway-event: stub handlers for 11.2/11.3 created in `use-cases/gateway/` so TypeScript resolves. These will be filled in 11.2/11.3.
- All 85 tests passing (18 gateway unit + 67 API including 4 new hotmart webhook tests).

### File List

- packages/db/src/schema/gateway.ts (new)
- packages/db/src/schema/index.ts (modified — re-export gateway)
- packages/db/migrations/0011_gateway_schema.sql (new)
- packages/db/migrations/meta/_journal.json (modified — added 0011 entry)
- packages/gateway/src/index.ts (modified — exports)
- packages/gateway/src/normalizers/hotmart.ts (new)
- packages/gateway/src/__tests__/hotmart-normalizer.test.ts (new)
- packages/gateway/package.json (modified — added test script + vitest)
- apps/api/src/app.ts (modified — register gateway webhook route)
- apps/api/src/routes/webhooks/hotmart.ts (new)
- apps/api/src/routes/webhooks/__tests__/hotmart.test.ts (new)
- apps/api/src/routes/internal.ts (modified — added gateway/process-event route)
- apps/api/src/use-cases/gateway/create-gateway-integration.ts (new)
- apps/api/src/use-cases/gateway/handle-purchase-approved.ts (new stub)
- apps/api/src/use-cases/gateway/handle-recovery-event.ts (new stub)
- apps/api/src/use-cases/gateway/handle-cancellation.ts (new stub)
- apps/api/src/jobs/process-gateway-event.ts (new)
- apps/api/src/__tests__/health.test.ts (modified — added missing mocks for @anthropic-ai/sdk, @leedi/agent, @leedi/gateway)
- apps/api/package.json (modified — added @leedi/gateway workspace dependency)
- _bmad-output/implementation-artifacts/sprint-status.yaml (modified — 11-1 in-progress)

### Change Log

- 2026-06-02: Story 11.1 implementation complete — gateway schema, normalizer, webhook endpoint, QStash processor scaffold, 85 tests passing.
