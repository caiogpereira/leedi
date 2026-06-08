---
baseline_commit: 9ea8a05
---

# Story 20.2: Tenant List & Lifecycle Management

Status: review

> **ARCHITECTURE OVERRIDE (approved, same as Story 20.1):** the story was authored
> assuming a Hono REST API (`apps/api/src/routes/admin/tenants.ts`) + an `(admin)`
> route group. The shipped admin app uses the **Next.js server-component** pattern:
> `(shell)/layout.tsx` guards via `getWorkspaceAdminRole === 'super_admin'`, pages
> read through use-cases in `packages/*`, and mutations run as **Server Actions**
> that independently re-verify super_admin (they bypass RLS via `withServiceRole`).
> No `apps/api/src/routes/admin/*` was created. The route group is `(shell)` and the
> page lives at `/clientes` (the path the shipped `AdminSidebar` already links to).

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

- [x] Task 1: Tenant list data (AC: #1, #6) — *override: use-case instead of Hono endpoint*
  - [x] Create `packages/tenancy/src/use-cases/list-all-tenants-detailed.ts` (instead of `apps/api/src/routes/admin/tenants.ts`)
  - [x] RBAC enforced by the `(shell)/layout.tsx` workspace-admin guard; reads via `withServiceRole`
  - [x] Query JOINs `tenants` + `subscriptions` (non-cancelled) + `usage_counters` + `invoices` (max `pago_em`) — uses **LATERAL** joins instead of the story's GROUP BY to avoid a fan-out double-count
  - [x] **Overage = PREVIOUS month** (`periodo = TO_CHAR(CURRENT_DATE - INTERVAL '1 month', 'YYYY-MM')`): AC#1 prose says "overage *last month*" while the Task 1 SQL said current month — followed the AC prose (the tiebreaker on a financial surface; current month is ~0 early in a month). Column labelled "Excedente (mês ant.)".
  - [ ] ~~Original: `GET /api/admin/tenants` endpoint~~ (superseded by override)
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

- [x] Task 2: Create tenant (AC: #2) — *override: use-case + server action*
  - [x] `createTenant` use-case (`packages/tenancy/src/use-cases/create-tenant.ts`): inserts the `tenants` row (`status: 'trial'`, `plan`, generated unique slug) via `withServiceRole`, then **reuses the Epic 2.6 invite flow** (`inviteMember` with `inviterRole: 'owner'`) to send the owner invitation.
  - [x] **Deviation (account creation):** the `users` row + `owner` membership are NOT created up front. Better-Auth provisions the account only at invite acceptance (`acceptInvitation` → `signUpEmail`); pre-creating a `users` row would leave the owner with no credential account and an unusable login. The owner accepts the email link, which creates both the account and the `owner` membership — the correct, already-tested path. AC#2 (tenant created + owner invitation sent + billing initialised) is fully met.
  - [x] `createBillingForTenant` (Story 17.1) called from the `createTenantAction` server action AFTER `createTenant` returns, in a try/catch — a billing failure does NOT roll back the tenant; the use-case flags it `billing_status: 'pendente_configuracao'` and the action returns `billingFailed: true`.
  - [x] **Enterprise plan:** the create form shows a conditional "Valor mensal (R$)" field when Enterprise is selected and passes `valorEnterprise`, so Enterprise tenants are NOT born with a pending-billing flag (advisor catch).

- [x] Task 3: Block / unblock (AC: #4, #5) — *override: use-cases + server actions*
  - [x] `blockTenant` / `unblockTenant` (`packages/tenancy/src/use-cases/set-tenant-block.ts`)
  - [x] **Enum correction:** `tenants.status` is the English enum (`active`/`trial`/`blocked`/`cancelled`), NOT `bloqueado`/`ativo`. Block sets `'blocked'`; unblock sets `'active'`.
  - [x] **AC#4 enforcement verified:** the agent read path already aborts when `tenants.status === 'blocked'` (`packages/agent/src/use-cases/process-message.ts:257`), so the status flip alone stops new-message processing. The gate is blind to `manual_block` vs `billing_lock` (only `audit_logs.acao` distinguishes them — per the pitfall).
  - [x] Audit: `manual_block` / `manual_unblock` with `{ reason, blocked_by/unblocked_by }`
  - [x] `reason` required (Zod `min(10)`) in the server action AND disabled-button guard in the UI
  - [x] Both server actions re-verify super_admin (`requireSuperAdmin`) — they bypass RLS via `withServiceRole`, so the layout guard alone is insufficient

- [x] Task 4: Impersonation action (AC: #3)
  - [x] Reuses the existing `POST /api/admin/impersonate` (Story 2.8); the moved `ImpersonateButton` calls it and redirects to `env.DASHBOARD_URL`

- [x] Task 5: Admin Clientes page (AC: #1–#7)
  - [x] `apps/admin/app/(shell)/clientes/page.tsx` (server component) + `ClientesClient.tsx` (client)
  - [x] Client-side search filter (`useState` + `useMemo`), no API call
  - [x] Columns: Cliente, Plano, Status badge, Valor/mês, Excedente, Último pagamento, Ações
  - [x] Status badge colors: trial → blue, active → green, blocked → red, cancelled → gray
  - [x] Billing-pending warning icon (`AlertTriangle` in a `<span title=…>` — substitutes shadcn `Tooltip`, not in `@leedi/ui`)
  - [x] Row actions: Impersonar + Bloquear/Liberar (inline buttons — substitute the shadcn `DropdownMenu`/`AlertDialog`, not in `@leedi/ui`; block/unblock use the `@leedi/ui` `Dialog` with a required reason)
  - [x] "Criar tenant" button opens the create `Dialog`

- [x] Task 6: Create tenant dialog (AC: #2)
  - [x] `@leedi/ui` `Dialog` form: Nome, E-mail do responsável, Plano (native `<select>`), conditional Valor (Enterprise)
  - [x] On success closes the dialog and `router.refresh()`; billing-failure path keeps the dialog open with the inline warning

- [x] Task 7: Financial history per tenant (FR138)
  - [x] `getTenantInvoices` use-case (`packages/tenancy/src/use-cases/list-tenant-invoices.ts`) — last 12 invoices, empty array (not 404) for new tenants; exposed via `getTenantInvoicesAction`
  - [x] Row name click opens a `Dialog` (substitute for shadcn `Sheet`, not in `@leedi/ui`) "Histórico financeiro — [Nome]" with columns Data, Vencimento, Valor, Excedente, Status (color-coded), Pago em + empty state

- [x] Task 8: Tests
  - [x] Unit: `createTenant` inserts trial tenant + invites owner via Epic 2.6; slug-collision suffix; propagates invite failure (3 tests)
  - [x] Unit: `blockTenant` sets `'blocked'` + `manual_block` audit; `unblockTenant` sets `'active'` + `manual_unblock` audit (4 tests)
  - [x] Unit: `getTenantInvoices` returns empty array for new tenant + maps/coerces rows; `listAllTenantsDetailed` maps the rich columns (3 tests)
  - [x] Component: search filter narrows the list without a server call; "Liberar" only for blocked + "Bloquear" for active; billing-pending warning rendering (3 tests)
  - [x] **Server-action auth gate (the story's "non-workspace-admin returns 403"):** `actions.test.ts` asserts `blockTenantAction` rejects an unauthenticated caller, a `support` role, and a non-admin (null), allows `super_admin` (forwarding actor + workspace), and enforces the Zod `reason min(10)` (5 tests). This is the RLS-bypass surface, so it gets explicit coverage.
  - [~] Sheet-specific assertion reinterpreted: the "Sheet" is the history `Dialog` (UI substitution); covered indirectly by the client render path
  - [x] **Bonus:** fixed the pre-existing stale `switch-tenant.test.ts` (its `@leedi/db` mock lacked `withServiceRole` after the tenant-status gate was added in a prior session) and added a blocked-tenant rejection case

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

claude-opus-4-8 (BMad Dev)

### Debug Log References

_none_

### Completion Notes List

- **Architecture override (same as 20.1, approved):** server-component page at `/clientes` (the path `AdminSidebar` already links) + use-cases in `@leedi/tenancy` + Next.js Server Actions. No Hono `apps/api/src/routes/admin/*` created.
- **Server actions re-verify super_admin:** every mutation/read action calls `requireSuperAdmin` (session → `getWorkspaceAdmin` → `role === 'super_admin'`). The `(shell)/layout.tsx` guard protects page render but NOT a direct server-action POST, and the actions bypass RLS via `withServiceRole` — so the independent re-check is mandatory (defense in depth).
- **Status enum trap:** `tenants.status` is the **English** enum (`active`/`trial`/`blocked`/`cancelled`); the story's `bloqueado`/`ativo` are wrong. Block → `blocked`, unblock → `active`. (`subscriptions`/`invoices` keep their PT-BR literals.)
- **AC#4/#5 enforcement verified, not assumed:** the agent loop already aborts when `tenants.status === 'blocked'` (`process-message.ts:257`), so a manual block rides the same read-side gate as the automated billing lock (Story 17.2). Distinguished only by `audit_logs.acao` (`manual_block` vs `billing_lock`).
- **Owner provisioning deviation:** does NOT pre-create `users`/`memberships` (would break login — Better-Auth creates the account only at invite acceptance). Reuses `inviteMember` (Epic 2.6); the owner's account + `owner` membership are created on accept. AC#2 satisfied (tenant + invite + billing).
- **Enterprise billing (advisor catch):** the create form adds a conditional monthly-value field for Enterprise and passes `valorEnterprise`, so Enterprise tenants aren't born flagged `pendente_configuracao`.
- **UI substitutions (documented like 20.1):** `@leedi/ui` only ships `Dialog` (+ Button/Input/Label/Textarea). shadcn `Sheet`/`DropdownMenu`/`AlertDialog`/`Tooltip`/`Select`/`Badge` are substituted with `Dialog` (history + block/unblock + create), inline action buttons, a native `<select>`, `<span title>` tooltips, and inline status `<span>` badges.
- **2.8 consolidation (advisor catch):** the old `/tenants` page was consolidated into the richer `/clientes`. `ImpersonateButton` was **moved** (not deleted) to `clientes/` and `/tenants` now permanently redirects to `/clientes` so old links keep working. The unused `tenants` i18n namespace was replaced by `clientes`.
- **Overage period (advisor catch):** AC#1 prose ("overage last month") and the Task 1 SQL (current month) contradict; followed the AC prose — `usage_counters.periodo` of the previous month, column labelled "Excedente (mês ant.)".
- **"Don't block the last workspace_admin" pitfall — deliberately N/A:** the story's pitfall targets blocking a *user* who is a workspace admin. This story blocks a *tenant* (`tenants.status`), never a user/admin account, so the guard doesn't map. Recorded as a conscious skip, not an oversight.
- **Pre-existing test fix:** repaired `switch-tenant.test.ts` (stale `@leedi/db` mock missing `withServiceRole`, broken by a tenant-status gate added in a prior session) and added a blocked-tenant rejection case.
- **Verification:** `@leedi/tenancy` 27 tests pass (13 new + 2 added to switch-tenant), `@leedi/admin` 12 tests pass (8 new: 3 component + 5 server-action gate), typecheck clean (tenancy + admin), eslint clean, `next build` succeeds with `/clientes` as a Dynamic route and `/tenants` as a redirect.

### File List

- `packages/tenancy/src/use-cases/list-all-tenants-detailed.ts` (new)
- `packages/tenancy/src/use-cases/list-all-tenants-detailed.test.ts` (new)
- `packages/tenancy/src/use-cases/create-tenant.ts` (new)
- `packages/tenancy/src/use-cases/create-tenant.test.ts` (new)
- `packages/tenancy/src/use-cases/set-tenant-block.ts` (new)
- `packages/tenancy/src/use-cases/set-tenant-block.test.ts` (new)
- `packages/tenancy/src/use-cases/list-tenant-invoices.ts` (new)
- `packages/tenancy/src/use-cases/list-tenant-invoices.test.ts` (new)
- `packages/tenancy/src/use-cases/switch-tenant.test.ts` (modified — fix stale mock + add blocked-tenant case)
- `packages/tenancy/src/index.ts` (modified — export the 4 new use-cases + types)
- `apps/admin/app/(shell)/clientes/page.tsx` (new)
- `apps/admin/app/(shell)/clientes/ClientesClient.tsx` (new)
- `apps/admin/app/(shell)/clientes/ClientesClient.test.tsx` (new)
- `apps/admin/app/(shell)/clientes/actions.ts` (new)
- `apps/admin/app/(shell)/clientes/actions.test.ts` (new — super_admin gate / 403 coverage)
- `apps/admin/app/(shell)/clientes/ImpersonateButton.tsx` (new — moved from `tenants/`)
- `apps/admin/app/(shell)/tenants/page.tsx` (modified — now redirects to `/clientes`)
- `apps/admin/app/(shell)/tenants/ImpersonateButton.tsx` (deleted — moved to `clientes/`)
- `apps/admin/messages/pt-BR.json` (modified — replace `tenants` namespace with `clientes`)
- `apps/admin/package.json` (modified — add `zod` dependency)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (modified — `20-2` → review)

### Change Log

- 2026-06-08: Implemented Story 20.2 — super-admin Clientes page (tenant list with subscription value/overage/last-payment, lifecycle actions: create + impersonate + block/unblock with audited reason, client-side search, billing-pending warning, per-tenant financial history). Use-cases in `@leedi/tenancy` + Server Actions (override of story's Hono design). Consolidated the 2.8 `/tenants` surface into `/clientes`. Status → review.
