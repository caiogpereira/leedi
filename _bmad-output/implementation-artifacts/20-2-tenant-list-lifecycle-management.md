---
baseline_commit: 9ea8a05
---

# Story 20.2: Tenant List & Lifecycle Management

Status: ready-for-dev

## Story

As a **super-admin**,
I want to see all tenants with their status and perform lifecycle actions (create, impersonate, block, force-release),
so that I can provide support and manage the business efficiently.

## Acceptance Criteria

1. **Given** a super-admin navigates to Admin → Clientes, **When** the page loads, **Then** a table shows all tenants with columns: name, plan, status badge (Trial / Ativo / Bloqueado / Cancelado), monthly value (`subscriptions.valor`), overage last month (`usage_counters.overage_valor`), last payment date (`invoices.pago_em MAX`).
2. **Given** a super-admin clicks "Criar tenant" and fills in: company name, owner email, and plan (Starter / Pro / Enterprise), **When** saved, **Then** a new tenant record is created, an owner invitation email is sent (reusing Epic 2.6 invite flow), and `create-billing-for-tenant` (Story 17.1) is called to initialise Asaas billing.
3. **Given** a super-admin clicks "Impersonar" on a tenant row, **When** confirmed, **Then** the super-admin is redirected to the dashboard impersonated as that tenant (reusing Epic 2.8 impersonation), with an `audit_log` entry created.
4. **Given** a super-admin clicks "Bloquear" on an active tenant and confirms the action, **When** executed, **Then** `tenants.status` changes to `bloqueado`, an `audit_log` entry is created (`acao: 'manual_block', detalhes: { reason, blocked_by }`), and the tenant's agent stops processing new messages.
5. **Given** a super-admin clicks "Liberar forçado" with a required reason note, **When** confirmed, **Then** `tenants.status` returns to `ativo`, `audit_log` entry is created with the reason in `detalhes`, and the tenant's services resume immediately.
6. **Given** the tenant list, **When** the super-admin types in the search field, **Then** the list filters in real-time by tenant name (client-side filter, no new API call needed for reasonable tenant counts).
7. **Given** a newly created tenant has `billing_status: 'pendente_configuracao'` in config (Story 17.1 failure case), **When** the tenant row is shown, **Then** a warning icon appears with tooltip "Configuração de cobrança pendente".

## Tasks / Subtasks

- [ ] Task 1: `GET /api/admin/tenants` endpoint (AC: #1, #6)
  - [ ] Create `apps/api/src/routes/admin/tenants.ts`
  - [ ] `requireWorkspaceAdmin()` guard (from Story 20.1)
  - [ ] Query: JOIN `tenants` + `subscriptions` + `usage_counters` (current month) + `invoices` (latest paid)
    ```sql
    SELECT t.id, t.nome, t.slug, t.status, t.plano, t.created_at,
           s.valor AS subscription_valor,
           uc.overage_valor,
           MAX(i.pago_em) AS ultimo_pagamento,
           t.config->>'billing_status' AS billing_status
    FROM tenants t
    LEFT JOIN subscriptions s ON s.tenant_id = t.id AND s.status != 'cancelada'
    LEFT JOIN usage_counters uc ON uc.tenant_id = t.id AND uc.periodo = TO_CHAR(CURRENT_DATE, 'YYYY-MM')
    LEFT JOIN invoices i ON i.tenant_id = t.id
    GROUP BY t.id, s.valor, uc.overage_valor
    ORDER BY t.created_at DESC
    ```
  - [ ] Returns array of tenant rows; no pagination for V1 (admin dataset is small)

- [ ] Task 2: `POST /api/admin/tenants` — Create tenant (AC: #2)
  - [ ] Body: `{ nome, ownerEmail, plano: 'starter' | 'pro' | 'enterprise' }`
  - [ ] Use case sequence:
    1. Create `tenants` row (`status: 'trial'`, `plano`)
    2. Create `users` row for owner email if not exists
    3. Create `memberships` row (`papel: 'owner'`)
    4. Send invitation email via `inviteTeamMember` use case (Story 2.6)
    5. Call `createBillingForTenant` (Story 17.1) — if billing fails, tenant is still created but flagged
  - [ ] Wrap steps 1–4 in a DB transaction; step 5 outside transaction (Asaas is external)
  - [ ] Returns `{ tenantId, status: 'created' }`

- [ ] Task 3: `PATCH /api/admin/tenants/:tenantId/block` and `/unblock` (AC: #4, #5)
  - [ ] `PATCH /api/admin/tenants/:tenantId/block`: body `{ reason: string (required) }`
    - Set `tenants.status = 'bloqueado'`
    - Insert `audit_log { acao: 'manual_block', entidade: 'tenant', entidade_id: tenantId, detalhes: { reason, blocked_by: session.userId } }`
    - Return 200
  - [ ] `PATCH /api/admin/tenants/:tenantId/unblock`: body `{ reason: string (required) }`
    - Set `tenants.status = 'ativo'`
    - Insert `audit_log { acao: 'manual_unblock', detalhes: { reason, unblocked_by: session.userId } }`
    - Return 200
  - [ ] Both require `requireWorkspaceAdmin()` guard

- [ ] Task 4: Impersonation action (AC: #3)
  - [ ] Reuse the impersonation mechanism from Story 2.8 (`POST /api/admin/impersonate`)
  - [ ] The "Impersonar" button in the tenant list calls this existing endpoint and redirects to the dashboard
  - [ ] No new API needed — just wire the UI button to the existing action

- [ ] Task 5: Admin Clientes page (AC: #1–#7)
  - [ ] Create `apps/admin/app/(admin)/clientes/page.tsx`
  - [ ] Search input (client-side filter): `useState` with tenant name filter applied to the fetched array
  - [ ] Table columns: Nome, Plano, Status badge, Valor/mês, Excedente, Último pagamento, Actions
  - [ ] Status badge colors: Trial → blue, Ativo → green, Bloqueado → red, Cancelado → gray
  - [ ] Warning icon on rows where `billing_status === 'pendente_configuracao'` (shadcn/ui `Tooltip` with text "Configuração de cobrança pendente")
  - [ ] Actions column: `DropdownMenu` (shadcn/ui) with items:
    - "Impersonar" → calls `/api/admin/impersonate` + redirect
    - "Bloquear" → `AlertDialog` requiring reason text → calls `PATCH .../block`
    - "Liberar" (only shown if status is `bloqueado`) → `AlertDialog` requiring reason text → calls `PATCH .../unblock`
  - [ ] "Criar tenant" button: opens `Dialog` (shadcn/ui) with the creation form (Task 6)

- [ ] Task 6: Create tenant dialog (AC: #2)
  - [ ] `Dialog` (shadcn/ui) with form: Nome (required), Email do responsável (required, email type), Plano (select: Starter / Pro / Enterprise)
  - [ ] On submit: calls `POST /api/admin/tenants`; on success closes dialog and refetches tenant list
  - [ ] Error handling: if billing setup failed (billing_status in response), show inline warning "Tenant criado, mas configuração de cobrança falhou. Configure manualmente."

- [ ] Task 7: Financial history per tenant (FR138) (AC: new)
  - [ ] Create `GET /api/admin/tenants/:tenantId/invoices` in `apps/api/src/routes/admin/tenants.ts`:
    - RBAC: `requireWorkspaceAdmin()`
    - Returns last 12 `invoices` rows for the given `tenantId` ordered by `created_at DESC`
    - Response: `{ invoices: [{ id, valor, valor_overage, vencimento, pago_em, status, asaas_payment_id }] }`
    - 404 if `tenantId` not found; empty array is valid for new tenants
  - [ ] In `apps/admin/app/(admin)/clientes/page.tsx`, make tenant rows clickable:
    - On row click: open a shadcn/ui `Sheet` (slide-in panel) titled "Histórico financeiro — [Tenant Nome]"
    - Sheet fetches `GET /api/admin/tenants/:tenantId/invoices` on open
    - Table inside Sheet: columns "Data", "Vencimento", "Valor", "Overage", "Status", "Pago em"
    - Status badge colors from Story 17.3 design (pago=green, pendente=yellow, atrasado=red, cancelado=gray)
    - Empty state: "Nenhuma fatura gerada para este tenant."

- [ ] Task 8: Tests (AC: #1, #2, #4, #5 + FR138)
  - [ ] Unit: `POST /api/admin/tenants` creates tenant + membership + invitation (mocked)
  - [ ] Unit: `PATCH .../block` sets status + creates audit_log; non-workspace-admin returns 403
  - [ ] Unit: `PATCH .../unblock` with missing `reason` body returns 400 (reason is required)
  - [ ] Unit: `GET /api/admin/tenants/:tenantId/invoices` returns last 12 invoices; returns empty array (not 404) for new tenant
  - [ ] Component: search filter narrows tenant list without API call
  - [ ] Component: "Liberar" action only shown when tenant status is `bloqueado`
  - [ ] Component: Sheet opens on row click and renders invoice table

## Dev Notes

- **Files to create:** `apps/api/src/routes/admin/tenants.ts`, `apps/admin/app/(admin)/clientes/page.tsx`
- **Files to modify:** `apps/api/src/routes/admin/index.ts` (register tenants routes), `apps/admin/app/(admin)/layout.tsx` (nav already updated in 20.1)
- **Impersonation reuse:** The `POST /api/admin/impersonate` endpoint from Story 2.8 already exists. The "Impersonar" button just calls it with `{ tenantId }` and redirects the super-admin to `apps/dashboard`.
- **Financial history per tenant (FR138):** Tenant row click navigates to a detail page or expands an accordion showing invoice history. For V1, a simple `Sheet` (shadcn/ui) slide-in panel showing the last 12 invoices for that tenant is sufficient. Fetch via `GET /api/admin/tenants/:tenantId/invoices` (add this lightweight endpoint).
- **Pagination:** For V1, fetch all tenants (no pagination). If the tenant list grows beyond ~200, add server-side pagination with `limit/offset`. Not needed at launch.
- **`reason` field is required for block/unblock:** Validate in the API (Zod: `z.string().min(10)`) — a meaningful reason is mandatory for audit purposes.

### Testing standards

- Unit tests for all three CRUD endpoints (list, create, block/unblock)
- Component tests for search filter and action dropdown behaviour

### Pitfalls to avoid

- Do NOT allow blocking the last active workspace_admin — add a check before blocking: if `workspace_admins WHERE user_id = targetUser` exists, block is forbidden.
- Do NOT confuse blocking (super-admin manual action) with billing lockdown (Story 17.2 automated). Both result in `tenants.status = 'bloqueado'`, but `audit_log.acao` distinguishes them: `manual_block` vs `billing_lock`.
- The create tenant flow MUST send the invitation email — a tenant created without the owner receiving an invite is unreachable.

### References

- [Source: docs/01-leedi-arquitetura.md#5.1] (tenants, audit_logs schema)
- [Source: _bmad-output/planning-artifacts/epics.md#Story 20.2, FR128–FR138]
- [Source: _bmad-output/implementation-artifacts/2-8-super-admin-workspace-tenant-impersonation.md] (impersonation endpoint to reuse)
- [Source: _bmad-output/implementation-artifacts/2-6-team-member-invitation-flow.md] (invite flow to reuse for owner invitation)
- [Source: _bmad-output/implementation-artifacts/17-1-asaas-integration-subscription-creation.md] (createBillingForTenant to call on tenant creation)
- [Source: _bmad-output/implementation-artifacts/20-1-financial-health-dashboard-mrr-revenue-delinquencies.md] (requireWorkspaceAdmin middleware)

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
