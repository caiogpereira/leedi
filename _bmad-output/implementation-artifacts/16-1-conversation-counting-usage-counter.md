---
baseline_commit: 9ea8a05
---

# Story 16.1: Conversation Counting & Usage Counter

Status: ready-for-dev

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

- [ ] Task 1: DB schema + migration for `usage_counters` (AC: #1)
  - [ ] Add `usage_counters` table to `packages/db/src/schema/billing.ts` (or new `packages/db/src/schema/usage.ts`)
  - [ ] `usageCounters`: `id` (uuid pk default gen_random_uuid()), `tenantId` (uuid notNull FK → `tenants.id`), `periodo` (text notNull), `conversasUsadas` (int notNull default 0), `conversasLimite` (int notNull), `overageConversas` (int notNull default 0), `overageValor` (numeric(10,2) notNull default 0), `custoIaUsd` (numeric(10,4) notNull default 0), `updatedAt` (timestamptz)
  - [ ] `UNIQUE("tenant_id", "periodo")`
  - [ ] `ENABLE ROW LEVEL SECURITY`; tenant policy; super-admin bypass for `custo_ia_usd` reads
  - [ ] Check migration journal for next number; add migration file
  - [ ] Re-export from `packages/db/src/schema/index.ts`
- [ ] Task 2: Create `@leedi/usage` package (AC: #8)
  - [ ] `packages/usage/package.json`, `packages/usage/src/index.ts`
  - [ ] Export use cases: `incrementUsage`, `getUsageCounter`, `getCustoIaUsd` (super-admin only)
  - [ ] Add to `pnpm-workspace.yaml`
- [ ] Task 3: `incrementUsage` use case (AC: #2, #3, #4, #5, #6, #7)
  - [ ] Create `packages/usage/src/use-cases/increment-usage.ts`
  - [ ] Input: `{ tenantId: string; billable: boolean; aiCostUsd?: number }`
  - [ ] If `billable = false`: skip conversation counter increment, optionally increment `custo_ia_usd` if `aiCostUsd` provided
  - [ ] If `billable = true`:
    - Resolve `conversasLimite` from `subscriptions` (query once per request — or pass as param)
    - Upsert: `INSERT INTO usage_counters (tenant_id, periodo, conversas_usadas, conversas_limite, ...) VALUES (?, ?, 1, ?, ...) ON CONFLICT (tenant_id, periodo) DO UPDATE SET conversas_usadas = CASE WHEN usage_counters.conversas_usadas < EXCLUDED.conversas_limite THEN usage_counters.conversas_usadas + 1 ELSE usage_counters.conversas_usadas END, overage_conversas = CASE WHEN usage_counters.conversas_usadas >= EXCLUDED.conversas_limite THEN usage_counters.overage_conversas + 1 ELSE usage_counters.overage_conversas END, overage_valor = CASE ... THEN usage_counters.overage_valor + 0.30 ELSE usage_counters.overage_valor END, updated_at = now()`
  - [ ] If `aiCostUsd` provided: add to same upsert `custo_ia_usd = usage_counters.custo_ia_usd + EXCLUDED.custo_ia_usd`
- [ ] Task 4: Wire `incrementUsage` into conversation window creation (AC: #2, #3, #4)
  - [ ] In `apps/api/src/use-cases/messaging/create-conversation-window.ts` (Story 5.5), import `@leedi/usage` and call `incrementUsage({ tenantId, billable })` after inserting the `conversation_windows` row
  - [ ] Pass the tenant's subscription plan as a param OR query `subscriptions` inline
- [ ] Task 5: Wire AI cost increment after agent response (AC: #5)
  - [ ] In `apps/api/src/use-cases/agent/process-message.ts` (Story 7.2), after the Agent SDK call completes and `agent_messages` are persisted, call `incrementUsage({ tenantId, billable: false, aiCostUsd: totalCostUsd })`
  - [ ] `totalCostUsd` = sum of `custo_usd` across all `agent_messages` created in this invocation
- [ ] Task 6: `getUsageCounter` use case (for Story 16.2 UI) (AC: #8)
  - [ ] Create `packages/usage/src/use-cases/get-usage-counter.ts`
  - [ ] Input: `{ tenantId: string; periodo?: string }` (default = current month)
  - [ ] Returns `UsageCounter` type (all fields except `custoIaUsd` filtered out for tenant access)
  - [ ] `getCustoIaUsd` (super-admin only): returns `custoIaUsd` for a tenant + period
- [ ] Task 7: Tests (AC: #2, #3, #4, #5, #6, #7)
  - [ ] Unit: `incrementUsage(billable=false)` does NOT increment `conversas_usadas`
  - [ ] Unit: first call for a period creates row with `conversas_usadas = 1`
  - [ ] Unit: when `conversas_usadas === conversas_limite`, increments `overage_conversas` and `overage_valor`
  - [ ] Unit: `custo_ia_usd` incremented correctly when `aiCostUsd` provided
  - [ ] Integration: concurrent upserts do not double-count (use Postgres advisory lock test or real DB)

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

_not yet assigned_

### Debug Log References

_none_

### Completion Notes List

_not yet implemented_

### File List

_not yet implemented_

### Change Log

_none_
