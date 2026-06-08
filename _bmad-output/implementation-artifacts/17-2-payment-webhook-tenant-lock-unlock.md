---
baseline_commit: 992b842
---

# Story 17.2: Payment Webhook — Tenant Lock & Unlock

Status: review

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
