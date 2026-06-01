---
baseline_commit: 9ea8a05
---

# Story 17.3: Tenant Billing Panel

Status: ready-for-dev

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

- [ ] Task 1: API endpoint `GET /api/billing/summary` (AC: #1, #3, #4)
  - [ ] Create `apps/api/src/routes/billing.ts` (or add to existing billing route file if it exists from 17.1)
  - [ ] `GET /api/billing/summary`: returns `{ subscription: { plano, valor, status, proximo_vencimento }, tenant: { status }, billing_status: tenants.config.billing_status }`
  - [ ] RBAC guard: `requireRole(['owner'])` — return 403 for other roles
  - [ ] Query: JOIN `subscriptions` + `tenants` by `tenant_id` from auth context

- [ ] Task 2: API endpoint `GET /api/billing/invoices` (AC: #1, #2, #5)
  - [ ] `GET /api/billing/invoices?limit=6`: returns array of `{ id, valor, valor_overage, vencimento, pago_em, status }` ordered by `created_at DESC`
  - [ ] RBAC guard: `requireRole(['owner'])`
  - [ ] Empty array is valid (new tenant) — do not 404

- [ ] Task 3: Dashboard billing page (AC: #1–#5)
  - [ ] Create `apps/dashboard/app/(dashboard)/settings/billing/page.tsx`
  - [ ] Fetch data via TanStack Query: `GET /api/billing/summary` + `GET /api/billing/invoices`
  - [ ] Top section: plan card with `plano`, `valor` (R$ X,XX/mês), `status` badge, `proximo_vencimento` (formatted as DD/MM/YYYY)
  - [ ] Warning banner: conditional render based on `subscription.status === 'atrasada'` or `tenant.status === 'bloqueado'` — use `Alert` component (shadcn/ui) in `variant="destructive"`
  - [ ] Invoice table: `Table` (shadcn/ui) with columns: Data, Vencimento, Valor, Extras, Status — last 6 rows
  - [ ] Invoice row click: expand `Collapsible` (shadcn/ui) showing full detail + receipt link
  - [ ] Empty state: `EmptyState` component (from packages/ui) when invoices array is empty
  - [ ] Add navigation entry to settings sidebar: "Cobrança" linking to `/settings/billing`

- [ ] Task 4: Settings sidebar navigation update (AC: #1)
  - [ ] In `apps/dashboard/app/(dashboard)/settings/layout.tsx` (or sidebar component), add "Cobrança" nav item
  - [ ] Item is only visible to `owner` role — use RBAC helper from `@leedi/auth` on the client side (or conditionally render based on session)

- [ ] Task 5: Tests (AC: #1, #3, #4, #5)
  - [ ] Unit: `GET /api/billing/summary` returns 403 for operator role
  - [ ] Unit: `GET /api/billing/invoices` returns empty array (not 404) when no invoices exist
  - [ ] Unit: billing page renders warning banner when `subscription.status === 'atrasada'`
  - [ ] Unit: billing page renders empty state when invoices array is empty

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

_not yet assigned_

### Debug Log References

_none_

### Completion Notes List

_not yet implemented_

### File List

_not yet implemented_

### Change Log

_none_
