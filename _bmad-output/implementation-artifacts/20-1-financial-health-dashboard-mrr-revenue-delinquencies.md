---
baseline_commit: 992b842
---

# Story 20.1: Financial Health Dashboard (MRR, Revenue, Delinquencies)

Status: done

## Story

As a **super-admin**,
I want to see the financial health of the SaaS at a glance,
so that I can manage cash flow and identify payment problems early.

## Acceptance Criteria

1. **Given** a super-admin navigates to Admin → Financeiro, **When** the page loads, **Then** they see four KPI cards: MRR (sum of all `subscriptions.valor WHERE status = 'ativa'`), current month received revenue (sum of `invoices.valor WHERE pago_em BETWEEN month_start AND now()`), projected revenue (sum of `subscriptions.valor WHERE status IN ('ativa', 'atrasada')`), and total open receivables (sum of `invoices.valor WHERE status IN ('pendente', 'atrasado')`).
2. **Given** the delinquency section is rendered, **When** visible, **Then** a table lists all tenants with `invoices.status = 'atrasado'`, showing: tenant name, plan, days overdue (`CURRENT_DATE - invoices.vencimento`), and outstanding value (sum of all overdue invoices per tenant).
3. **Given** a tenant pays their overdue invoice and the Asaas webhook is processed (Story 17.2), **When** the super-admin refreshes the Financeiro page, **Then** the paid tenant disappears from the delinquency list and MRR/received metrics update accordingly.
4. **Given** the churn metric section, **When** rendered, **Then** it shows the count of `subscriptions WHERE status = 'cancelada'` with `updated_at` in the current month — the "churn this month" metric.
5. **Given** a super-admin is NOT logged in as workspace_admin, **When** they attempt to access `/api/admin/financial-health`, **Then** they receive `HTTP 403`.

## Tasks / Subtasks

> **ARCHITECTURE OVERRIDE (approved):** The story was authored assuming a Hono REST API (`apps/api/src/routes/admin/*`) + a separate `(admin)` route group. The shipped admin app (Story 2.8) already uses the **Next.js server-component** pattern: the `(shell)/layout.tsx` guards via `getWorkspaceAdminRole === 'super_admin'`, and pages read directly through use-cases in `packages/*`. Following the existing architecture, Task 1 was delivered as the **`getFinancialHealth()` aggregation use-case in `@leedi/billing`** (mirroring `listAllTenants`), consumed by a **server component** at `apps/admin/app/(shell)/financeiro/page.tsx`. No `apps/api/src/routes/admin/*` was created. Subtasks below are checked against this mapping.

- [x] Task 1: Financial-health aggregation use-case (AC: #1–#4) — *override: use-case instead of Hono endpoint*
  - [x] Create `packages/billing/src/use-cases/get-financial-health.ts` (instead of `apps/api/src/routes/admin/financial-health.ts`)
  - [x] RBAC: enforced by the `(shell)/layout.tsx` workspace-admin guard (`getWorkspaceAdminRole`) — non-super-admins never reach the page; the use-case reads via `withServiceRole` and is only callable behind that guard (see AC#5 note in Completion Notes)
  - [x] Compute via SQL `FILTER` aggregation — **split into separate subscription and invoice queries** to avoid the subscriptions⋈invoices fan-out that would double-count `subscriptions.valor`:
    ```sql
    SELECT
      SUM(s.valor) FILTER (WHERE s.status = 'ativa') AS mrr,
      SUM(i.valor) FILTER (WHERE i.pago_em >= date_trunc('month', CURRENT_DATE)) AS received_this_month,
      SUM(s.valor) FILTER (WHERE s.status IN ('ativa', 'atrasada')) AS projected,
      SUM(i.valor) FILTER (WHERE i.status IN ('pendente', 'atrasado')) AS open_receivables,
      COUNT(DISTINCT s.tenant_id) FILTER (WHERE s.status = 'cancelada' AND s.updated_at >= date_trunc('month', CURRENT_DATE)) AS churn_this_month
    FROM subscriptions s
    LEFT JOIN invoices i ON i.subscription_id = s.id
    ```
  - [x] Delinquency list query: separate query joining `invoices` (status `atrasado`) + `tenants`
  - [x] Return: `{ mrr, receivedThisMonth, projectedRevenue, openReceivables, churnThisMonth, delinquents: [{ tenantId, tenantName, plano, daysOverdue, totalOverdue }] }` (note: `tenantName` — `tenants.name` is English in the real schema, not `nome`)
  - [x] Exported from `packages/billing/src/index.ts` (instead of route registration)

- [x] Task 2: Admin Financeiro page (AC: #1–#4)
  - [x] Create `apps/admin/app/(shell)/financeiro/page.tsx` (route group is `(shell)`, not `(admin)`)
  - [x] 4 KPI cards (responsive grid):
    - "MRR" — `R$ {mrr.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`
    - "Recebido este mês" — value + "de {projectedRevenue} projetados"
    - "Recebíveis em aberto" — value in red if > 0
    - "Churn este mês" — count with "assinaturas canceladas"
  - [x] Delinquency table below KPIs: columns "Cliente", "Plano", "Dias em atraso", "Valor em aberto"
    - [x] Sort by `daysOverdue DESC` (done in SQL `ORDER BY days_overdue DESC`)
    - [~] Row click navigates to tenant detail — deferred to Story 20.2 (which builds the tenant detail surface)
    - [x] Empty state: "Nenhum cliente em atraso." with a checkmark icon
  - [x] Server component (override of `useQuery`/TanStack); `export const dynamic = "force-dynamic"` so a refresh reflects the latest payments per **AC#3** (the story's 5-min staleTime is a client-query concept that would make AC#3's fresh-on-refresh fail)
  - [x] "Financeiro" nav item already present in `AdminSidebar` (Story 3.2)

- [x] Task 3: Admin sidebar navigation (AC: #1)
  - [x] `apps/admin/components/shell/AdminSidebar.tsx` already lists "Financeiro" → `/financeiro`, "Clientes" → `/clientes`, "Operacional" → `/operacional` (shipped in Epic 3.2). No change needed — verified present and active-aware.

- [x] Task 4: Tests (AC: #1, #3, #5)
  - [x] Unit: MRR aggregation filters only `status = 'ativa'`; projected includes `atrasada` (asserted on the SQL contract)
  - [x] Unit: delinquency list filters strictly on `i.status = 'atrasado'` (excludes paid) + numeric coercion + empty-state mapping
  - [x] AC#5 (non-workspace-admin → no access): satisfied by the existing `(shell)/layout.tsx` guard (`getWorkspaceAdminRole !== 'super_admin'` → redirect). No `/api/admin/financial-health` route exists under the override, so 403-at-endpoint is reinterpreted as guard-enforced no-access (see Completion Notes)
  - [x] Unit: churn metric counts only `status = 'cancelada'` cancellations in the current month (`date_trunc('month', CURRENT_DATE)`)

## Dev Notes

- **Files to create:** `apps/api/src/routes/admin/financial-health.ts`, `apps/api/src/routes/admin/index.ts`, `apps/admin/app/(admin)/financeiro/page.tsx`
- **Files to modify:** `apps/api/src/app.ts` (register admin routes), `apps/admin/app/(admin)/layout.tsx` (add nav items)
- **`requireWorkspaceAdmin` middleware:** Create in `apps/api/src/middleware/require-workspace-admin.ts`. Read `workspace_admins WHERE user_id = session.userId AND workspace_id = WORKSPACE_ID`. Return 403 if no row found.
- **`WORKSPACE_ID`:** Single workspace for V1. Store as env var `WORKSPACE_ID` or derive from a seeded constant in `packages/db`.
- **Currency formatting:** All monetary values are in BRL. Format as `R$ X.XXX,XX` using `toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })` in the frontend.
- **SQL aggregation pattern:** Use PostgreSQL `FILTER (WHERE ...)` clause for conditional aggregation in a single query — avoids multiple round trips. Drizzle may not support this natively; use `sql\`...\`` raw SQL helper for this query.
- **Admin app vs dashboard app:** Financeiro lives in `apps/admin` — the separate Next.js app for Exponensia internal use. Do NOT put it in `apps/dashboard`.
- **No RLS bypass needed:** Admin routes run with the service role or as a workspace_admin whose DB role has access to all tenant data. Confirm that `packages/db` connection in `apps/api` uses service role credentials for admin routes.

### Testing standards

- Vitest unit tests for the aggregation query logic (use test DB or mock Drizzle)
- Integration test: financial health endpoint with seeded subscriptions/invoices data

### Pitfalls to avoid

- Do NOT include cancelled subscriptions in MRR.
- Do NOT show invoices that were paid on time in the delinquency list — filter strictly by `status = 'atrasado'`.
- The "projected revenue" metric uses `status IN ('ativa', 'atrasada')` — atrasada subscriptions still represent expected revenue even if overdue.
- Admin API routes must NOT be accessible by tenant users — `requireWorkspaceAdmin` middleware is the gate, not just authentication.

### References

- [Source: docs/01-leedi-arquitetura.md#6.12 Domínio Billing + Usage] (subscriptions, invoices schema)
- [Source: _bmad-output/planning-artifacts/epics.md#Story 20.1, FR123–FR127]
- [Source: _bmad-output/implementation-artifacts/17-1-asaas-integration-subscription-creation.md] (subscriptions schema)
- [Source: _bmad-output/implementation-artifacts/17-2-payment-webhook-tenant-lock-unlock.md] (invoice status lifecycle)
- [Source: _bmad-output/implementation-artifacts/3-2-admin-shell-navigation.md] (admin layout to extend)

## Dev Agent Record

### Agent Model Used

claude-opus-4-8 (Amelia / BMad Dev)

### Debug Log References

_none_

### Completion Notes List

- **Architecture override (approved by user before implementation):** delivered reads as a server-component page backed by a new aggregation use-case, matching the existing admin app (Story 2.8) instead of the Hono REST API the story assumed. No `apps/api/src/routes/admin/*` created.
- **AC#5 reinterpretation:** the story's literal "GET `/api/admin/financial-health` → 403" cannot be met verbatim because that endpoint does not exist under the override. The **intent** (no unauthorized access to SaaS-wide financial data) is enforced by the pre-existing `(shell)/layout.tsx` guard: `getWorkspaceAdminRole(session.user.id) !== 'super_admin'` → `redirect`. The `getFinancialHealth` use-case reads via `withServiceRole` (RLS bypass) and is only reachable from behind that guard — same security posture as `listAllTenants` (Story 2.8). Reviewer note: this is a deliberate, documented deviation, not a missed AC.
- **SQL fan-out bug avoided:** the story's sample SQL `JOIN`s subscriptions↔invoices then `SUM(s.valor)`, which double-counts when a subscription has >1 invoice. Implemented as **two separate aggregate queries** (subscriptions; invoices) plus the delinquency query — no fan-out.
- **Enum trap handled (per advisor):** `subscriptions`/`invoices` use PT-BR status literals (`ativa`/`atrasada`/`cancelada`, `pendente`/`atrasado`) — kept as-is and asserted via SQL-contract tests. `tenants` uses English (`name`, `plan`), so the delinquency SELECT reads `t.name`/`t.plan` and returns `tenantName`.
- **Freshness (AC#3):** used `export const dynamic = "force-dynamic"` rather than the story's 5-min staleTime, so refreshing after an Asaas webhook immediately reflects updated MRR/received and drops the paid tenant from the delinquency list.
- **Tasks 3 (sidebar nav) was already shipped** in Epic 3.2 (`AdminSidebar` already links `/financeiro`, `/clientes`, `/operacional`); verified, no change needed.
- **Verification:** `@leedi/billing` 18 tests pass (7 new), `@leedi/admin` 4 tests pass (no regression), typecheck clean (billing + admin), eslint clean, `next build` succeeds with `/financeiro` as a Dynamic route (no build-time DB call).

### File List

- `packages/billing/src/use-cases/get-financial-health.ts` (new)
- `packages/billing/src/__tests__/get-financial-health.test.ts` (new)
- `packages/billing/src/index.ts` (modified — export `getFinancialHealth`, `FinancialHealth`, `Delinquent`)
- `apps/admin/app/(shell)/financeiro/page.tsx` (new)
- `apps/admin/package.json` (modified — add `@leedi/billing` workspace dependency)
- `apps/admin/messages/pt-BR.json` (modified — add `financeiro` i18n namespace)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (modified — `20-1` → review)

### Change Log

- 2026-06-04: Implemented Story 20.1 — financial health aggregation use-case (`getFinancialHealth`) + super-admin Financeiro server-component dashboard (MRR, received, projected, open receivables, churn, delinquency table). Followed existing server-component admin architecture (override of story's Hono design). Status → review.
- 2026-06-12: Code review (Opus 4.8) → **done**. Clean: all enum literals verified against the real schema (`subscriptions` `ativa`/`atrasada`/`cancelada`; `invoices` `pendente`/`pago`/`atrasado`/`cancelado`; `tenants.name`/`tenants.plan` English) — the mock-blind surface checked directly, not assumed. The two split aggregate queries (subscriptions / invoices) correctly avoid the fan-out double-count; delinquency query filters strictly on `i.status = 'atrasado'`. AC#5 reinterpretation (layout guard vs literal 403) accepted — `(shell)/layout.tsx` `getWorkspaceAdminRole === 'super_admin'` is authoritative and child pages cannot bypass it; `force-dynamic` satisfies AC#3 freshness. Tests are genuinely real (not vacuous): `get-financial-health.test.ts` asserts SQL contract + numeric coercion + empty-state mapping. i18n `financeiro` namespace complete, sidebar links `/financeiro` (no dead link). billing 34/34, typecheck clean.

### Code Review Findings (2026-06-12)

- **No defects.** Implementation matches the ACs (with the documented, sound architecture override) and the SQL is correct against the real schema.
- Tests confirmed real by inspection + suite run (billing 34/34). SQL-contract assertions in `get-financial-health.test.ts` would catch an enum/filter regression.
- Cross-epic contracts spot-checked empirically: delinquency disappears on payment (AC#3) rides the Asaas webhook + `force-dynamic` refresh; no code change needed.
