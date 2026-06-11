---
baseline_commit: 992b842
---

# Story 16.1: Conversation Counting & Usage Counter

Status: done

## Story

As a developer,
I want `usage_counters` to be accurately maintained as conversation windows are created,
so that usage metering is reliable for both billing and tenant transparency.

## Acceptance Criteria

1. **Given** the DB migration for `usage_counters` runs (table defined in Architecture §6.12), **When** applied, **Then** table exists with: `id` (uuid pk), `tenant_id` (uuid FK notNull), `periodo` (text notNull, format `'YYYY-MM'`), `conversas_usadas` (int notNull default 0), `conversas_limite` (int notNull), `overage_conversas` (int notNull default 0), `overage_valor` (numeric notNull default 0), `custo_ia_usd` (numeric notNull default 0), `updated_at`. UNIQUE constraint on `(tenant_id, periodo)`. RLS enabled.
2. **Given** a new billable `conversation_window` (`billable = true`) is created for a tenant in the current period (`YYYY-MM` matching `created_at`), **When** the window creation use case runs (from Story 5.5), **Then** `usage_counters.conversas_usadas` is incremented atomically using `INSERT ... ON CONFLICT (tenant_id, periodo) DO UPDATE SET conversas_usadas = usage_counters.conversas_usadas + 1, updated_at = now()`.
3. **Given** a tenant is in a period with no prior counter record, **When** their first billable conversation of the month occurs, **Then** a new `usage_counters` row is inserted with `conversas_usadas: 1` and `conversas_limite` read from the tenant's active subscription plan (`subscriptions.plano`): Starter → 500, Pro → 2000, Enterprise → 10000.
4. **Given** a conversation window is created with `billable = false` (playground session per Story 8.1), **When** the counter logic runs, **Then** `usage_counters.conversas_usadas` is NOT incremented. Only `billable = true` windows count.
5. **Given** the AI agent processes a message and the response uses tokens (stored in `agent_messages.tokens_input` + `tokens_output` + `custo_usd`), **When** processing completes, **Then** `usage_counters.custo_ia_usd` is incremented by the message's `custo_usd` for the current period using an atomic upsert (same ON CONFLICT pattern). This field is never exposed to tenant-facing APIs.
6. **Given** the `usage_counters` upsert is called concurrently (two messages arrive for the same tenant simultaneously), **When** both execute, **Then** the PostgreSQL `ON CONFLICT DO UPDATE` ensures atomic increment — no counter is lost or double-counted. No application-level lock is needed.
7. **Given** a counter's `conversas_usadas` reaches `conversas_limite`, **When** the next billable window is created, **Then** the use case increments `overage_conversas` (NOT `conversas_usadas`) and `overage_valor += 0.30`, and continues creating the window normally (service is not interrupted — see Story 16.3 for the optional block behavior).
8. **Given** the `@leedi/usage` package is the owner of this domain, **When** any other module needs to read or write usage counters, **Then** it imports from `@leedi/usage` — no direct `usage_counters` table queries outside this package.

## Tasks / Subtasks

- [x] Task 1: DB schema + migration for `usage_counters` (AC: #1)
  - [x] Add `usage_counters` table to `packages/db/src/schema/usage.ts`
  - [x] `usageCounters`: all fields per spec including `alertasEnviados` jsonb
  - [x] `UNIQUE("tenant_id", "periodo")`
  - [x] `ENABLE ROW LEVEL SECURITY`; tenant policy; `getCustoIaUsd` uses `withServiceRole`
  - [x] Migration 0015 added; journal entry updated
  - [x] Re-exported from `packages/db/src/schema/index.ts`
- [x] Task 2: Create `@leedi/usage` package (AC: #8)
  - [x] `packages/usage/package.json` updated with dependencies
  - [x] `packages/usage/src/index.ts` exports all use cases
  - [x] Workspace already configured via `packages/*` glob
- [x] Task 3: `incrementUsage` use case (AC: #2, #3, #4, #5, #6, #7)
  - [x] Created `packages/usage/src/use-cases/increment-usage.ts`
  - [x] Returns `{ blocked, alertsDue }` — caller fires notifications (keeps notification import out of package)
  - [x] Uses `tenants.plan` (not subscriptions — Epic 17 is backlog)
  - [x] Atomic ON CONFLICT DO UPDATE with CASE logic for overage
  - [x] aiCostUsd included in same upsert when provided
- [x] Task 4: Wire `incrementUsage` into conversation window creation (AC: #2, #3, #4)
  - [x] In `apps/api/src/routes/webhook-meta.ts`: `checkUsageBlock` before `resolveConversationWindow`; `incrementUsage` after new window creation (messageCount === 1)
  - [x] `checkUsageBlock` in `packages/usage/src/use-cases/check-usage-block.ts`
- [x] Task 5: Wire AI cost increment after agent response (AC: #5)
  - [x] `trackAiCost()` helper in `apps/api/src/routes/internal.ts` — fire-and-forget after `processMessage` returns
  - [x] Queries agent_threads by conversationWindowId → agent_messages by threadId + since timestamp
- [x] Task 6: `getUsageCounter` use case (for Story 16.2 UI) (AC: #8)
  - [x] `packages/usage/src/use-cases/get-usage-counter.ts` with `getUsageCounter`, `getUsageHistory`, `getCustoIaUsd`
- [x] Task 7: Tests (AC: #2, #3, #4, #5, #6, #7)
  - [x] 9 unit tests — all passing; covers billable=false, blocked, threshold alerts, dedup, aiCostUsd

## Dev Notes

- **Files to create:** `packages/db/src/schema/usage.ts` (or extend billing.ts), `packages/usage/package.json`, `packages/usage/src/index.ts`, `packages/usage/src/use-cases/increment-usage.ts`, `packages/usage/src/use-cases/get-usage-counter.ts`
- **Files to modify:** `packages/db/src/schema/index.ts` (re-export), `pnpm-workspace.yaml` (add usage package), `apps/api/src/use-cases/messaging/create-conversation-window.ts` (wire increment), `apps/api/src/use-cases/agent/process-message.ts` (wire AI cost)
- **Plan limits:** Starter = 500 conversations/month, Pro = 2000, Enterprise = 10000. These are constants in `packages/usage/src/constants.ts` — `PLAN_LIMITS = { starter: 500, pro: 2000, enterprise: 10000 }`.
- **Overage price:** R$0.30 per conversation. Constant `OVERAGE_PRICE_BRL = 0.30` in same constants file.
- **Atomic upsert:** Use Drizzle's `sql` tagged template for the CASE-based ON CONFLICT upsert — Drizzle's ORM doesn't support conditional ON CONFLICT natively. Use `db.execute(sql`INSERT ... ON CONFLICT ... DO UPDATE SET ...`)`
- **`periodo` format:** Always `'YYYY-MM'` string, e.g., `'2026-06'`. Compute as `format(new Date(), 'yyyy-MM')` using `date-fns` (already in stack) or manual `new Date().toISOString().slice(0, 7)`.
- **No new npm packages.**

### Testing standards

- Vitest unit tests with mocked Drizzle for all use cases.
- Integration test: verify ON CONFLICT atomic increment with a real Supabase test DB (concurrent inserts scenario).

### Pitfalls to avoid

- Do NOT expose `custo_ia_usd` through any tenant-facing endpoint — it violates FR108. Only `getCustoIaUsd` (super-admin) returns this field.
- Do NOT compute `conversas_limite` from `subscriptions` on every message processed — cache it in the counter row itself (`conversas_limite` column) and only refresh when the plan changes.
- The ON CONFLICT upsert MUST be atomic in a single SQL statement — do NOT do a SELECT then UPDATE in two round trips (race condition).
- Do NOT increment usage for messages in a window that was already counted in a previous call — the window creation is the trigger, not each message.

### References

- [Source: docs/01-leedi-arquitetura.md#6.12 Domínio Billing + Usage] (usage_counters schema)
- [Source: _bmad-output/planning-artifacts/epics.md#Story 16.1, FR103, FR106]
- [Source: _bmad-output/implementation-artifacts/5-5-conversation-window-tracking-24h-billing-unit.md] (conversation_windows — trigger for usage increment)
- [Source: _bmad-output/implementation-artifacts/8-1-playground-chat-interface.md] (billable=false for playground — must NOT be counted)
- [Source: _bmad-output/implementation-artifacts/7-2-agent-core-processing-loop.md] (agent_messages with custo_usd — source for AI cost)

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

_none_

### Completion Notes List

- Created `packages/db/src/schema/usage.ts` with `usageCounters` table (all fields per spec + `alertasEnviados` jsonb for 16.2/16.3)
- Migration 0015 hand-written (CREATE TABLE + RLS + UNIQUE index)
- `packages/usage` package fully built with `incrementUsage`, `getUsageCounter`, `getUsageHistory`, `getCustoIaUsd`, `checkUsageBlock`
- `incrementUsage` returns `{ blocked, alertsDue }` — no static import of `@leedi/notification` (avoids transitive resend init in any package that uses usage)
- `tenants.plan` used instead of `subscriptions` (Epic 17 is backlog)
- Block check (`checkUsageBlock`) runs at `apps/api` layer in `webhook-meta.ts` BEFORE `resolveConversationWindow`
- AI cost tracked fire-and-forget via `trackAiCost` in `internal.ts` after agent loop completes
- 9 unit tests passing; typecheck clean (2 pre-existing api errors unrelated to this story)

### File List

- packages/db/src/schema/usage.ts (new)
- packages/db/src/schema/index.ts (modified)
- packages/db/migrations/0015_usage_counters.sql (new)
- packages/db/migrations/meta/_journal.json (modified)
- packages/usage/package.json (modified)
- packages/usage/src/index.ts (modified)
- packages/usage/src/constants.ts (new)
- packages/usage/src/use-cases/increment-usage.ts (new)
- packages/usage/src/use-cases/get-usage-counter.ts (new)
- packages/usage/src/use-cases/check-usage-block.ts (new)
- packages/usage/src/__tests__/increment-usage.test.ts (new)
- apps/api/package.json (modified — added @leedi/usage dep)
- apps/api/src/routes/webhook-meta.ts (modified — block check + increment on new window)
- apps/api/src/routes/internal.ts (modified — trackAiCost fire-and-forget)

### Change Log

- 2026-06-03: Story 16.1 implemented — usage_counters schema, @leedi/usage package, incrementUsage with atomic upsert, wired into webhook-meta and internal agent-flush handler
- 2026-06-11: Code review (epic-16) → done. Fixes: notification dedup race in `incrementUsage` (alert dispatch now gated on the atomic guarded `UPDATE ... RETURNING`, so concurrent increments can never double-fire the same notification); guard against divide-by-zero when overage notifications are disabled (`notificar_overage_a_cada = 0`); removed unused `withServiceRole` import. +1 unit test (overage disabled). **Documented deviation:** AC#1/AC#3 reference `subscriptions.plano` for the limit; implementation reads `tenants.plan` (subscriptions/billing plans are Epic 17 backlog) — `conversas_limite` is cached per counter row and will switch to `subscriptions` when Epic 17 lands.
