---
baseline_commit: 9ea8a05
---

# Story 20.1: Financial Health Dashboard (MRR, Revenue, Delinquencies)

Status: ready-for-dev

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

- [ ] Task 1: `GET /api/admin/financial-health` API endpoint (AC: #1–#4)
  - [ ] Create `apps/api/src/routes/admin/financial-health.ts`
  - [ ] RBAC guard: `requireWorkspaceAdmin()` middleware — checks session has `workspace_admins` row; return 403 otherwise
  - [ ] Compute in a single SQL query (or two at most) for performance:
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
  - [ ] Delinquency list query: separate query for the table data
  - [ ] Return: `{ mrr, receivedThisMonth, projectedRevenue, openReceivables, churnThisMonth, delinquents: [{ tenantId, tenantNome, plano, daysOverdue, totalOverdue }] }`
  - [ ] Register route in `apps/api/src/routes/admin/index.ts` and in `apps/api/src/app.ts`

- [ ] Task 2: Admin Financeiro page (AC: #1–#4)
  - [ ] Create `apps/admin/app/(admin)/financeiro/page.tsx`
  - [ ] 4 KPI cards (grid 2x2):
    - "MRR" — `R$ {mrr.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`
    - "Recebido este mês" — value + "de {projectedRevenue} projetados"
    - "Recebíveis em aberto" — value in red if > 0
    - "Churn este mês" — count with "assinaturas canceladas"
  - [ ] Delinquency table below KPIs: columns "Tenant", "Plano", "Dias em atraso", "Valor em aberto"
    - Sort by `daysOverdue DESC`
    - Row click navigates to tenant detail (Story 20.2)
    - Empty state: "Nenhum cliente em atraso. " with a checkmark icon
  - [ ] `useQuery` (TanStack Query) with `staleTime: 5 * 60 * 1000` (5 min) — financial data doesn't need real-time refresh
  - [ ] Add "Financeiro" nav item to admin sidebar

- [ ] Task 3: Admin sidebar navigation (AC: #1)
  - [ ] In `apps/admin/app/(admin)/layout.tsx` (or admin sidebar component):
    - Add nav items: "Financeiro" → `/financeiro`, "Clientes" → `/clientes`, "Operacional" → `/operacional`
  - [ ] These were likely stubbed in Epic 3 (admin shell) — fill in the actual routes now

- [ ] Task 4: Tests (AC: #1, #3, #5)
  - [ ] Unit: MRR calculation correctly sums only `status = 'ativa'` subscriptions
  - [ ] Unit: delinquency list excludes tenants with all invoices paid
  - [ ] Unit: non-workspace-admin request returns 403
  - [ ] Unit: churn metric counts only cancellations in the current month

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

_not yet assigned_

### Debug Log References

_none_

### Completion Notes List

_not yet implemented_

### File List

_not yet implemented_

### Change Log

_none_
