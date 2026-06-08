---
baseline_commit: 9ea8a05
---

# Story 17.3: Tenant Billing Panel

Status: review

## Story

As a **tenant owner**,
I want to see my current plan, invoice history, and next due date in the platform,
so that I can manage billing without contacting support.

## Acceptance Criteria

1. **Given** a tenant owner navigates to Configurações → Cobrança, **When** the page loads, **Then** they see: current plan name (Starter / Pro / Enterprise), monthly price, billing status (`ativa`, `atrasada`, `bloqueada`), next due date, and the last 6 invoices with status badge (Pago / Pendente / Atrasado / Cancelado).
2. **Given** a tenant owner clicks on an invoice row, **When** the detail expands or opens, **Then** they see: total value (base plan + overage), due date, payment date (if paid), and a "Baixar comprovante" link (if Asaas receipt URL is available).
3. **Given** the tenant's billing `status` is `atrasada` or the tenant is blocked, **When** the billing page loads, **Then** a prominent warning banner shows at the top: "Seu pagamento está atrasado. Regularize para evitar bloqueio." (atrasada) or "Conta suspensa por inadimplência. Seus dados estão preservados." (bloqueado) with a link to Asaas payment portal.
4. **Given** a viewer or operator role navigates to the billing page, **When** the page renders, **Then** they receive a 403 (or are redirected) — billing is owner-only.
5. **Given** the billing panel loads, **When** there are no invoices yet (newly created tenant), **Then** an empty state shows: "Nenhuma fatura gerada ainda. Seu primeiro ciclo será cobrado em [next due date]."

## Tasks / Subtasks

- [x] Task 1: API endpoint `GET /api/tenants/:tenantId/billing/summary` (AC: #1, #3, #4)
  - [x] Create `apps/api/src/routes/billing.ts`
  - [x] Returns `{ subscription, tenant: { status }, billing_status }` 
  - [x] RBAC guard: `requirePermission('billing:read')` — 403 for other roles
  - [x] Registered at `/api/tenants/:tenantId/billing`

- [x] Task 2: API endpoint `GET /api/tenants/:tenantId/billing/invoices` (AC: #1, #2, #5)
  - [x] Returns array of invoices ordered by `created_at DESC`, limit=6 default
  - [x] RBAC guard: `requirePermission('billing:read')`
  - [x] Returns empty array (not 404) for new tenants

- [x] Task 3: Dashboard billing page (AC: #1–#5)
  - [x] Create `apps/dashboard/app/(shell)/configuracoes/cobranca/page.tsx` (project uses `(shell)` route group and PT paths)
  - [x] Create `apps/dashboard/app/(shell)/configuracoes/cobranca/billing-client.tsx` (client component)
  - [x] Plan card with plano, valor/mês, status badge, próximo vencimento
  - [x] Warning banner for `subscription.status === 'atrasada'` or `tenant.status === 'blocked'`
  - [x] Invoice table with expand/collapse detail (vencimento, pago_em, total, receipt link)
  - [x] Empty state when invoices array is empty (shows next due date)

- [x] Task 4: Settings sidebar navigation update (AC: #1)
  - [x] Create `apps/dashboard/app/(shell)/configuracoes/layout.tsx` with sub-nav (Uso, Cobrança)

- [x] Task 5: Tests (AC: #1, #3, #4, #5)
  - [x] `apps/api/src/routes/__tests__/billing.test.ts` — 5 tests
  - [x] summary 403 for operator, 200 for owner
  - [x] invoices 403 for operator, empty array for new tenant, returns rows
  - [x] All 158 API tests passing

## Dev Notes

- **Files to create:** `apps/dashboard/app/(dashboard)/settings/billing/page.tsx`
- **Files to modify:** `apps/api/src/routes/billing.ts` (add new endpoints), `apps/dashboard/app/(dashboard)/settings/layout.tsx` (add nav item)
- **Receipt link:** Asaas returns a `invoiceUrl` or `bankSlipUrl` in the payment object. Store the relevant URL in `invoices` (add a `receipt_url text nullable` column — add via migration if not already in 17.1 schema) or fetch on demand from Asaas API. For V1, fetching on demand is acceptable to avoid storing transient Asaas URLs.
- **`valor_overage` display:** show as "R$ X,XX em excedentes" only when > 0. Do not show the overage row when 0.
- **Status badge colors:** `pago` → green, `pendente` → yellow, `atrasado` → red, `cancelado` → gray. Use the design token system from `packages/ui`.
- **No Stripe, no other gateway** — Asaas only for V1 (Brazil market).
- **`proximo_vencimento` might be null** for trial accounts — render "—" in that case.

### Testing standards

- Vitest unit tests for the API routes (role guard, empty invoices)
- Component test: warning banner conditional rendering, empty state render

### Pitfalls to avoid

- Do NOT expose `asaas_customer_id` or `asaas_subscription_id` in the API response — these are internal identifiers.
- Do NOT let operator/viewer roles access billing info — this is owner-only per RBAC.
- The Asaas receipt URL may expire — do not cache it indefinitely; fetch fresh on demand.

### References

- [Source: docs/01-leedi-arquitetura.md#6.12 Domínio Billing + Usage] (subscriptions, invoices schema)
- [Source: _bmad-output/planning-artifacts/epics.md#Story 17.3, FR102]
- [Source: _bmad-output/implementation-artifacts/17-1-asaas-integration-subscription-creation.md] (subscriptions schema)
- [Source: _bmad-output/implementation-artifacts/17-2-payment-webhook-tenant-lock-unlock.md] (billing status values)
- [Source: _bmad-output/implementation-artifacts/16-2-usage-dashboard-widget-threshold-alerts.md] (settings page pattern reference)

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

- Project uses `(shell)` route group and Portuguese paths (`configuracoes/cobranca`), not `(dashboard)/settings/billing` as spec suggested.
- No pre-existing settings sub-sidebar; created `configuracoes/layout.tsx` with Uso + Cobrança nav.
- No TanStack Query in the project — implemented with `useEffect`/`fetch` following existing pattern.

### Completion Notes List

- 2 API endpoints: `/billing/summary` + `/billing/invoices` with `billing:read` RBAC guard
- Billing client: plan card, overdue/blocked warning banner, invoice table with expand detail, empty state
- Settings sub-navigation layout for configuracoes section
- 5 unit tests passing for API routes

### File List

- apps/api/src/routes/billing.ts (new)
- apps/api/src/routes/__tests__/billing.test.ts (new)
- apps/api/src/app.ts (modified — billing route registered)
- apps/dashboard/app/(shell)/configuracoes/cobranca/page.tsx (new)
- apps/dashboard/app/(shell)/configuracoes/cobranca/billing-client.tsx (new)
- apps/dashboard/app/(shell)/configuracoes/layout.tsx (new)

### Change Log

- 2026-06-03: Implemented Story 17.3 — billing API endpoints, dashboard billing panel, settings sub-nav
