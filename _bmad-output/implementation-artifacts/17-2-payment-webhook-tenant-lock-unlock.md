---
baseline_commit: 9ea8a05
---

# Story 17.2: Payment Webhook — Tenant Lock & Unlock

Status: ready-for-dev

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

- [ ] Task 1: Asaas webhook endpoint `POST /webhooks/asaas` (AC: #1–#3, #6, #7)
  - [ ] Create `apps/api/src/routes/webhooks/asaas.ts` (Hono route)
  - [ ] Token validation: compare `payload.accessToken` with `env.ASAAS_WEBHOOK_TOKEN` using constant-time comparison (crypto.timingSafeEqual); return 401 on mismatch
  - [ ] Enqueue payload to BullMQ queue `'asaas-events'` with deduplication key `webhook:asaas:{payment.id}` (Redis SET NX TTL 24h) — return `HTTP 200` immediately after enqueue (Asaas retries on non-2xx)
  - [ ] Register route in `apps/api/src/app.ts` at `/webhooks/asaas`

- [ ] Task 2: BullMQ worker — process Asaas payment events (AC: #1–#3, #7)
  - [ ] Create `packages/billing/src/workers/asaas-event-worker.ts`
  - [ ] Handle `PAYMENT_RECEIVED`: look up `invoices WHERE asaas_payment_id = payload.payment.id` — if already `pago`, skip (idempotency); else update `invoices.status = 'pago'`, `pago_em = now()`; update `subscriptions.status = 'ativa'`; if tenant was `bloqueado` due to billing, set `tenants.status = 'ativo'`; call notification stub
  - [ ] Handle `PAYMENT_OVERDUE`: update `invoices.status = 'atrasado'`, `subscriptions.status = 'atrasada'` — do NOT block tenant here
  - [ ] Handle `PAYMENT_DELETED` / `PAYMENT_REFUNDED`: update `invoices.status = 'cancelado'`; insert `audit_log` entry
  - [ ] Retry config: 5 attempts with exponential backoff (1s, 5s, 30s, 5m, 30m); on exhaustion move to DLQ queue `'asaas-events-dlq'` and alert Sentry

- [ ] Task 3: BullMQ cron job — daily billing lockdown check (AC: #4, #5)
  - [ ] Create `packages/billing/src/jobs/daily-billing-check.ts`
  - [ ] Cron schedule: `'0 12 * * *'` UTC (09:00 BRT)
  - [ ] Query: all `invoices WHERE status = 'atrasado' AND vencimento <= now()`
  - [ ] For each invoice: compute `daysOverdue = differenceInDays(now(), invoice.vencimento)`
    - If `daysOverdue >= 7` AND tenant not already fully blocked: set `tenants.status = 'bloqueado'`; notify `conta_suspensa`
    - If `daysOverdue >= 3` AND `< 7` AND tenant `status != 'bloqueado'`: set `tenants.status = 'bloqueado'`; notify `conta_bloqueada_parcial`
  - [ ] Notifications sent via `@leedi/notification` stub (same pattern as Story 14.3 / 16.2)
  - [ ] Register cron job in `apps/api/src/jobs/index.ts` (or wherever BullMQ cron jobs are wired)

- [ ] Task 4: Enforce blocking in outbound message sending (AC: #4, #5)
  - [ ] In `apps/api/src/use-cases/messaging/` (the message-processing pipeline from Epic 4/7):
    - After resolving tenant, check `tenant.status === 'bloqueado'`
    - If blocked: do NOT invoke agent, do NOT send WhatsApp message, log warning `'[billing] tenant {tenantId} blocked — message suppressed'`
  - [ ] Note: dispatches (Epic 13) already check tenant status — verify that guard covers bloqueado state

- [ ] Task 5: Notification stubs for billing events (AC: #1, #4, #5)
  - [ ] In `@leedi/notification` (or inline until Epic 18 builds the full notification system):
    - Create `packages/notification/src/use-cases/send-billing-notification.ts` as a thin wrapper that logs the notification (stub) and calls `sendEmail` for email channel
    - Types: `conta_reativada`, `conta_bloqueada_parcial`, `conta_suspensa`
  - [ ] These stubs will be replaced by the full notification system in Epic 18

- [ ] Task 6: Unit + integration tests (AC: #1, #6, #7)
  - [ ] Unit: `PAYMENT_RECEIVED` worker path — idempotency (second call with same payment_id is no-op)
  - [ ] Unit: `PAYMENT_RECEIVED` sets tenant back to `ativo` when previously `bloqueado`
  - [ ] Unit: daily job sets `bloqueado` at 3-day threshold, full block at 7-day threshold
  - [ ] Unit: webhook endpoint rejects requests with wrong `accessToken` (returns 401)
  - [ ] Unit: outbound message suppressed when `tenant.status === 'bloqueado'`

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

_not yet assigned_

### Debug Log References

_none_

### Completion Notes List

_not yet implemented_

### File List

_not yet implemented_

### Change Log

_none_
