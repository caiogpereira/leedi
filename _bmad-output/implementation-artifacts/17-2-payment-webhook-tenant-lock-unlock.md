---
baseline_commit: 992b842
---

# Story 17.2: Payment Webhook — Tenant Lock & Unlock

Status: done

## Story

As a **tenant owner**,
I want my account to be automatically unlocked when payment is confirmed and locked gradually if I fall behind,
so that I don't need to contact support for routine payment situations.

## Acceptance Criteria

1. **Given** Asaas sends a `PAYMENT_RECEIVED` webhook for a tenant's invoice, **When** processed, **Then** `invoices.status` is set to `pago`, `invoices.pago_em` is set to now, `subscriptions.status` is set to `ativa`, and `tenants.status` is set to `ativo` (if it was `bloqueado` due to billing); a notification fires via `@leedi/notification`: `{ tipo: 'conta_reativada', titulo: 'Pagamento confirmado. Sua conta está ativa!' }`.
2. **Given** Asaas sends a `PAYMENT_OVERDUE` webhook for a tenant's invoice, **When** processed, **Then** `invoices.status` is set to `atrasado` and `subscriptions.status` is set to `atrasada`; the daily lockdown job (AC #4) is responsible for the actual tenant blocking — the webhook alone does not block.
3. **Given** Asaas sends a `PAYMENT_DELETED` or `PAYMENT_REFUNDED` webhook, **When** processed, **Then** `invoices.status` is updated to `cancelado` and an `audit_log` entry is created (`acao: 'invoice_cancelled'`).
4. **Given** the daily billing-check BullMQ job runs at 09:00 BRT, **When** it finds an invoice with `status: 'atrasado'` and `vencimento` ≤ 3 days ago, **Then** `tenants.status` is set to `bloqueado` (partial block — sending features disabled); a notification fires: `{ tipo: 'conta_bloqueada_parcial', titulo: 'Pagamento atrasado. Regularize para continuar enviando mensagens.' }`.
5. **Given** the daily job runs and finds an invoice with `status: 'atrasado'` and `vencimento` ≤ 7 days ago, **When** processed, **Then** `tenants.status` is set to `bloqueado` (full block — agent off, data preserved); a notification fires: `{ tipo: 'conta_suspensa', titulo: 'Conta suspensa por inadimplência. Seus dados estão preservados. Regularize para reativar.' }`.
6. **Given** a webhook arrives at `POST /webhooks/asaas`, **When** the `accessToken` in the payload does not match `env.ASAAS_WEBHOOK_TOKEN`, **Then** the endpoint returns `HTTP 401` and the payload is discarded without processing.
7. **Given** the same Asaas `payment_id` is received twice (duplicate webhook), **When** the second arrives, **Then** it is a no-op — idempotency is enforced by checking `invoices.asaas_payment_id` before any state change.

## Tasks / Subtasks

- [x] Task 1: Asaas webhook endpoint `POST /webhooks/asaas` (AC: #1–#3, #6, #7)
  - [x] Create `apps/api/src/routes/webhooks/asaas.ts` (Hono route)
  - [x] Token validation via AsaasProvider.verificarWebhook (constant-time comparison); return 401 on mismatch
  - [x] Redis SET NX TTL 24h deduplication key `webhook:asaas:{payment.id}`; enqueue to QStash (project uses QStash, not BullMQ)
  - [x] Register route in `apps/api/src/app.ts` at `/webhooks/asaas`

- [x] Task 2: QStash handler — process Asaas payment events (AC: #1–#3, #7)
  - [x] Create `apps/api/src/jobs/process-billing-event.ts` (QStash pattern, not BullMQ)
  - [x] Handle PAYMENT_RECEIVED with idempotency, update subscription to ativa, unblock tenant
  - [x] Handle PAYMENT_OVERDUE: update to atrasada — does NOT block tenant here
  - [x] Handle PAYMENT_DELETED/REFUNDED: update to cancelado + audit_log entry
  - [x] Register as `/api/internal/billing/process-asaas-event` in internal.ts (QStash retries)

- [x] Task 3: Daily billing lockdown check (AC: #4, #5)
  - [x] Create `apps/api/src/jobs/daily-billing-check.ts`
  - [x] Cron: `0 12 * * *` UTC (09:00 BRT) via QStash
  - [x] >= 3 days overdue → partial block; >= 7 days → full block; notifications via stub
  - [x] Register as `/api/internal/billing/daily-check` in internal.ts

- [x] Task 4: Enforce blocking in outbound message sending (AC: #4, #5)
  - [x] Added `tenantStatus` field to `AgentContextData` in `packages/agent/src/use-cases/process-message.ts`
  - [x] Query `tenants.status` in `loadAgentContext`
  - [x] Added check: `if ctxData.tenantStatus === 'blocked'` → abort with reason `tenant_blocked`

- [x] Task 5: Notification stubs for billing events (AC: #1, #4, #5)
  - [x] Created `packages/notification/src/use-cases/send-billing-notification.ts`
  - [x] Types: conta_reativada, conta_bloqueada_parcial, conta_suspensa
  - [x] Exported from `packages/notification/src/index.ts`

- [x] Task 6: Unit tests (AC: #1, #6, #7)
  - [x] `apps/api/src/routes/webhooks/__tests__/asaas.test.ts` — 4 tests (401, 200, dedup, no-payment-id)
  - [x] `apps/api/src/jobs/__tests__/process-billing-event.test.ts` — 5 tests
  - [x] `packages/agent/src/use-cases/__tests__/process-message.test.ts` — added tenant_blocked test
  - [x] All 153 API tests + 119 agent tests passing

## Dev Notes

- **Files to create:** `apps/api/src/routes/webhooks/asaas.ts`, `packages/billing/src/workers/asaas-event-worker.ts`, `packages/billing/src/jobs/daily-billing-check.ts`, `packages/notification/src/use-cases/send-billing-notification.ts`
- **Files to modify:** `apps/api/src/app.ts` (register webhook route), `apps/api/src/jobs/index.ts` (register cron job), `apps/api/src/use-cases/messaging/process-message.ts` (add blocking guard)
- **Asaas webhook payload shape:** `{ event: 'PAYMENT_RECEIVED' | 'PAYMENT_OVERDUE' | ..., payment: { id, value, status, ... }, accessToken: string }`. Validate the envelope before processing.
- **Partial vs full block:** Both set `tenants.status = 'bloqueado'`. The distinction (3-day = partial, 7-day = full) is tracked by checking `daysOverdue` — there is no separate `status` value for partial. The dashboard banner (Epic 17.3) will show different messages based on the invoice's `vencimento` date relative to today.
- **Notification stub pattern:** Epic 18 builds the full system. For now, `send-billing-notification.ts` logs + sends email via Resend (existing adapter). The call signature will be the same as Epic 18's `notification.send()` so the replacement is drop-in.
- **BullMQ Redis connection:** Reuse `@leedi/redis` (or `packages/connection`) connection — do not create new Redis clients per job.
- **idempotency key in Redis:** `webhook:asaas:{payment.id}` SET NX with TTL 24h. Check before enqueuing — if already set, return 200 immediately without re-enqueuing.

### Testing standards

- Vitest unit tests for each event handler in the worker
- Integration test: simulate `PAYMENT_RECEIVED` webhook → verify `invoices` and `subscriptions` rows updated, tenant unlocked
- Integration test: duplicate webhook with same `payment.id` → second call is no-op

### Pitfalls to avoid

- Do NOT block the tenant synchronously in the webhook handler — the webhook must return 200 quickly; blocking is done by the async worker.
- Do NOT process both partial and full block in the same daily job run for the same invoice — once tenant is fully blocked, skip the partial-block notification.
- Constant-time comparison for `accessToken` is mandatory to prevent timing-based token enumeration.
- The daily cron runs at 09:00 BRT — register as UTC equivalent (12:00 UTC) to account for DST in Brazil.

### References

- [Source: docs/01-leedi-arquitetura.md#6.12 Domínio Billing + Usage] (subscriptions, invoices schema)
- [Source: docs/01-leedi-arquitetura.md#9.3 Webhooks] (webhook validation pattern)
- [Source: docs/01-leedi-arquitetura.md#9.6 Webhook retry + DLQ pattern]
- [Source: _bmad-output/planning-artifacts/epics.md#Story 17.2, FR100, FR101]
- [Source: _bmad-output/implementation-artifacts/17-1-asaas-integration-subscription-creation.md] (AsaasProvider + subscriptions schema)
- [Source: _bmad-output/implementation-artifacts/11-1-hotmart-webhook-receiver-canonical-event-normalization.md] (webhook idempotency pattern to follow)

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

- BullMQ not available — project uses QStash for all async processing. Adapted to QStash pattern (internal endpoint).
- `tenants.status` enum uses `'blocked'` not `'bloqueado'` — confirmed from tenancy Drizzle schema.

### Completion Notes List

- Webhook endpoint: token validation + Redis SET NX + QStash enqueue
- Event processor: handles PAYMENT_RECEIVED/OVERDUE/DELETED/REFUNDED
- Daily check: 3-day partial block, 7-day full block via QStash cron
- Tenant blocking guard added to processMessage (aborts with tenant_blocked)
- Notification stubs for 3 billing event types
- 153 API tests + 119 agent tests passing

### File List

- apps/api/src/routes/webhooks/asaas.ts (new)
- apps/api/src/routes/webhooks/__tests__/asaas.test.ts (new)
- apps/api/src/jobs/process-billing-event.ts (new)
- apps/api/src/jobs/__tests__/process-billing-event.test.ts (new)
- apps/api/src/jobs/daily-billing-check.ts (new)
- apps/api/src/routes/internal.ts (modified — 2 new billing routes)
- apps/api/src/app.ts (modified — Asaas webhook route + @leedi/billing import)
- apps/api/package.json (modified — added @leedi/billing dep)
- packages/agent/src/use-cases/process-message.ts (modified — tenant blocking guard)
- packages/agent/src/use-cases/__tests__/process-message.test.ts (modified — tenant_blocked test)
- packages/notification/src/use-cases/send-billing-notification.ts (new)
- packages/notification/src/index.ts (modified)

### Change Log

- 2026-06-03: Implemented Story 17.2 — webhook, event processor, daily check, tenant blocking guard
- 2026-06-11: Code review (Opus) — see Code Review Findings below.

## Code Review Findings (2026-06-11, Opus — deep "money module" review)

Two CRITICAL defects made the entire payment flow non-functional in production; both
are fixed. The original implementation faithfully followed the written ACs — the ACs
themselves were wrong / incomplete (deviations recorded below) and the unit tests
were green over the bugs because they mocked the wrong contract.

### C1 (CRITICAL, fixed) — webhook auth read the wrong location → every real webhook 401
- **Bug:** `verificarWebhook(payload, token)` validated `payload.accessToken` (JSON body).
  Asaas sends the webhook auth token in the **`asaas-access-token` HTTP header**, never in
  the body (confirmed in Asaas docs + OpenAPI `securitySchemes`). Result: every legitimate
  Asaas webhook returned 401; nothing downstream ever ran.
- **Spec deviation:** AC#6 literally says "the `accessToken` in the payload" — this is wrong.
  Corrected to read the header. AC#6 should be read as "the token Asaas sends".
- **Fix:** `PaymentProvider.verificarWebhook(incomingToken, expectedToken)` now compares two
  token strings constant-time (SHA-256 → `timingSafeEqual`); the route reads
  `c.req.header('asaas-access-token')`. Tests rewritten to send the header (incl. the
  missing-header 401 case).

### C2 (CRITICAL, fixed) — no `PAYMENT_CREATED` handler → invoices never created → every event a silent no-op
- **Bug:** The Asaas charge lifecycle is always `PAYMENT_CREATED → … → PAYMENT_RECEIVED`.
  Nothing in Epic 17 ever inserted an `invoices` row (create-billing only inserts a
  `subscriptions` row), and the processor only handled RECEIVED/OVERDUE/DELETED/REFUNDED.
  `getInvoiceByPaymentId` therefore always returned null → RECEIVED/OVERDUE/DELETED were
  no-ops, `daily-billing-check` never found overdue invoices, and the tenant billing panel
  (17.3) was permanently empty.
- **Spec gap:** invoice creation from `PAYMENT_CREATED` was never in any AC.
- **Fix:** `process-billing-event.ts` rewritten:
  - `PAYMENT_CREATED` upserts an `invoices` row (resolves our subscription+tenant from
    `payment.subscription` → fallback `payment.customer`; stores valor, vencimento, receipt_url).
  - RECEIVED/OVERDUE upsert-if-missing so a lost `PAYMENT_CREATED` never loses state.
  - `PAYMENT_CONFIRMED` also reactivates (funds committed for boleto/pix go straight to RECEIVED).
  - Idempotency is DB-enforced: **partial UNIQUE index on `invoices.asaas_payment_id`**
    (migration `0019_billing_invoice_payment_id_unique.sql`, applied) + `ON CONFLICT DO NOTHING`.
  - Unrecognised events are a logged no-op (Asaas warns: never throw on unexpected payloads).

### H1 (HIGH, fixed) — a confirmed payment could be permanently lost
- **Bug:** the webhook set the Redis dedup key (`SET NX`, TTL 24h) **before** enqueuing to
  QStash, and the enqueue failure was swallowed (`.catch` log) while still returning 200.
  Asaas would not retry (got 200) and the Redis key blocked reprocessing for 24h → the
  payment event vanished.
- **Fix:** on enqueue failure, release the dedup key (`redis.del`) and return **500** so Asaas
  retries. The durable idempotency guard is now the UNIQUE index, not the Redis key.

### Notes / deferred (low)
- AC#1 refinement: `conta_reativada` now fires only on a real **blocked → active** transition
  (pre-update tenant status captured), not on every routine renewal payment — avoids
  "your account is active!" spam on normal monthly charges.
- Daily check still maps both 3-day (partial) and 7-day (full) overdue to `tenants.status =
  'blocked'` with distinct notification copy (AC#4/#5 distinction is cosmetic for now — a
  separate "partial" status would need a tenant_status enum migration). Acknowledged in dev notes.
- `packages/notification/.../send-billing-notification.ts` is dead code (the daily check uses
  `sendNotificationToTenantRole` directly). Left in place; harmless. Low.
- `audit_logs.actorUserId`/`workspaceId` are populated with `tenantId` for system-initiated
  rows (no FK on the column, so no crash) — semantic smell, consistent with create-billing; low.
- Pre-existing typecheck break fixed: `daily-billing-check.ts` `OverdueRow` now satisfies
  drizzle's `execute<T extends Record<string, unknown>>` (index signature).
- **`daily-billing-check.ts` (AC#4/#5 — 3-day/7-day tenant blocking) now has behavioral
  coverage** (`__tests__/daily-billing-check.test.ts`, 4 tests): 3-day partial block +
  "Pagamento atrasado" notice, 7-day full block + "Conta suspensa" notice, below-threshold
  (2-day) no-op, and already-blocked skip. It was the load-bearing path that actually blocks
  paying customers and had zero tests before this review.
- DB smoke (rolled back) confirmed the upsert path on real Postgres: `::invoice_status_enum`
  cast + `ON CONFLICT (asaas_payment_id) WHERE … DO NOTHING` deduplicates (2 identical inserts
  → 1 row) and the subscription FK holds.

### Files changed in review
- apps/api/src/routes/webhooks/asaas.ts (header auth + enqueue-failure handling)
- apps/api/src/jobs/process-billing-event.ts (rewritten: PAYMENT_CREATED + upsert + ON CONFLICT)
- apps/api/src/jobs/daily-billing-check.ts (typecheck + unused import)
- packages/billing/src/ports/payment-provider.ts, adapters/asaas-provider.ts (verificarWebhook signature)
- packages/db/migrations/0019_billing_invoice_payment_id_unique.sql (new, applied), src/schema/billing.ts (unique index)
- Tests: webhooks/__tests__/asaas.test.ts, jobs/__tests__/process-billing-event.test.ts (rewritten),
  jobs/__tests__/daily-billing-check.test.ts (new)
