---
baseline_commit: 992b842
---

# Story 20.3: Operational Health (Conversations, AI Cost, Risk Signals)

Status: review

> **ARCHITECTURE OVERRIDE (approved, same as Stories 20.1/20.2):** the story assumes
> a Hono REST API (`apps/api/src/routes/admin/operational-health.ts`) + an `(admin)`
> route group. The shipped admin app uses the **Next.js server-component** pattern:
> `(shell)/layout.tsx` guards via `getWorkspaceAdminRole === 'super_admin'` and the
> page reads through a `@leedi/billing` use-case. No `apps/api/src/routes/admin/*`.
> Route group is `(shell)`; page at `/operacional` (the path `AdminSidebar` links).

## Story

As a **super-admin**,
I want to see aggregate operational metrics and risk signals across all tenants,
so that I can spot margin problems and proactively prevent churn.

## Acceptance Criteria

1. **Given** a super-admin views Admin → Operacional, **When** the page loads, **Then** they see five aggregate KPIs: total conversations across all tenants (current month), aggregate AI cost in USD, estimated real margin percentage, new tenants in the current month, and net growth (new tenants this month minus churn this month — `net_growth = new_tenants - churn_this_month`).
2. **Given** the margin calculation, **When** rendered, **Then** the page displays: `margin % = (MRR_BRL - AI_cost_in_BRL) / MRR_BRL × 100`, using a fixed USD→BRL exchange rate from `env.USD_TO_BRL_RATE` (default 5.0 if not set), with a note showing the rate used.
3. **Given** the risk signals section, **When** rendered, **Then** tenants within 20% of their `conversas_limite` (i.e., `conversas_usadas >= conversas_limite * 0.8`) are listed as "Upsell opportunities" with their plan, usage percentage, and an "Entrar em contato" CTA.
4. **Given** the risk signals section, **When** rendered, **Then** tenants with WhatsApp quality rating `yellow` or `red` (from `connections.quality_rating`) are listed as "Risco de churn" with the tenant name, current rating, and the number of consecutive days at that rating.
5. **Given** a tenant's quality rating drops to `red`, **When** the next Operacional dashboard load occurs, **Then** that tenant appears in the churn-risk list within 5 minutes (data is refreshed server-side; no real-time stream needed for V1).
6. **Given** a super-admin is not logged in as workspace_admin, **When** they attempt to access `/api/admin/operational-health`, **Then** they receive `HTTP 403`.

## Tasks / Subtasks

- [x] Task 1: Operational-health aggregation (AC: #1–#4, #6) — *override: use-case instead of Hono endpoint*
  - [x] Create `packages/billing/src/use-cases/get-operational-health.ts` (instead of `apps/api/src/routes/admin/operational-health.ts`); exported from `@leedi/billing`
  - [x] RBAC enforced by the `(shell)/layout.tsx` workspace-admin guard; reads via `withServiceRole`
  - [x] **Enum traps fixed (vs story text):** table is `whatsapp_connections` (not `connections`); `quality_rating` is PT-BR `verde`/`amarelo`/`vermelho` (risk = `amarelo`/`vermelho`, NOT `yellow`/`red`); `subscriptions.status` PT-BR (`ativa`/`cancelada`); `tenants` columns are English (`name`/`plan`)
  - [x] Aggregates split into 3 separate queries (usage / tenants / subscriptions) to avoid fan-out double-count; `net_growth` + `marginPct` computed in the use-case; `usdToBrlRate` injected by the caller (pure use-case)
  - [ ] ~~Original aggregate KPIs query (single JOIN)~~ — superseded; would fan-out double-count
  - [x] Near-limit query + quality-risk query (with `days_at_risk`) + owner-email LATERAL for the CTA
  - [ ] ~~Original endpoint scaffolding~~ (superseded by override):
    ```sql
    SELECT
      SUM(uc.conversas_usadas) AS total_conversas,
      SUM(uc.custo_ia_usd) AS total_ai_cost_usd,
      COUNT(t.id) FILTER (WHERE t.created_at >= date_trunc('month', CURRENT_DATE)) AS new_tenants_this_month,
      COUNT(DISTINCT s.tenant_id) FILTER (WHERE s.status = 'cancelada' AND s.updated_at >= date_trunc('month', CURRENT_DATE)) AS churn_this_month
    FROM tenants t
    LEFT JOIN usage_counters uc ON uc.tenant_id = t.id AND uc.periodo = TO_CHAR(CURRENT_DATE, 'YYYY-MM')
    LEFT JOIN subscriptions s ON s.tenant_id = t.id
    ```
  - [ ] Compute `net_growth = new_tenants_this_month - churn_this_month` server-side before returning
  - [ ] MRR query: reuse from Story 20.1 (`SUM(subscriptions.valor WHERE status = 'ativa'`)
  - [ ] Margin calculation (server-side): `margin = (mrr_brl - ai_cost_usd * usd_to_brl_rate) / mrr_brl * 100`; `usd_to_brl_rate = env.USD_TO_BRL_RATE ?? 5.0`
  - [ ] Near-limit tenants query:
    ```sql
    SELECT t.id, t.nome, t.plano, uc.conversas_usadas, uc.conversas_limite,
           ROUND(uc.conversas_usadas::numeric / NULLIF(uc.conversas_limite, 0) * 100, 1) AS usage_pct
    FROM usage_counters uc
    JOIN tenants t ON t.id = uc.tenant_id
    WHERE uc.periodo = TO_CHAR(CURRENT_DATE, 'YYYY-MM')
      AND uc.conversas_usadas >= uc.conversas_limite * 0.8
    ORDER BY usage_pct DESC
    ```
  - [ ] Quality risk tenants query:
    ```sql
    SELECT t.id, t.nome, c.quality_rating, c.updated_at
    FROM connections c
    JOIN tenants t ON t.id = c.tenant_id
    WHERE c.quality_rating IN ('yellow', 'red')
      AND c.status = 'conectado'
    ORDER BY c.quality_rating DESC, c.updated_at ASC
    ```
  - [ ] Response: `{ totalConversas, totalAiCostUsd, marginPct, usdToBrlRate, newTenantsThisMonth, churnThisMonth, netGrowth, nearLimitTenants: [...], qualityRiskTenants: [...] }`
  - [ ] Register in `apps/api/src/routes/admin/index.ts`

- [x] Task 2: `USD_TO_BRL_RATE` env var (AC: #2)
  - [x] Added `USD_TO_BRL_RATE: z.coerce.number().positive().default(5.0)` to `packages/config/src/schema.ts`
  - [x] Updated `.env.example` with the rate + manual-update note

- [~] Task 3: Days at risk calculation for quality (AC: #4) — *approximate; precise value deferred*
  - [x] `days_at_risk = CURRENT_DATE - DATE(c.updated_at)` in the quality-risk query (`whatsapp_connections.updated_at`)
  - [~] **Known limitation (surfaced to user):** `updated_at` is NOT a rating-transition timestamp — the Story 4.3 health-check write path does not bump it per rating change, and there is no `quality_rating_changed_at` column. So `days_at_risk` is "days since the row was last written", a usable proxy but not the exact *consecutive days at rating* AC#4 asks for. The clean fix (bump `updated_at` only on rating change, OR add a dedicated column + migration) was prepared but **reverted by the user** to avoid touching Story 4.3's shipped health-check path / adding a migration into the mid-flight journal. Documented in the use-case + flagged as deferred follow-up. The risk *list membership* (which tenants are at amarelo/vermelho) is exact; only the day-count is approximate.

- [x] Task 4: Admin Operacional page (AC: #1–#5)
  - [x] `apps/admin/app/(shell)/operacional/page.tsx` (server component) reading `env.USD_TO_BRL_RATE`
  - [x] 5 KPI cards: Conversas este mês, Custo IA (USD) + BRL-at-rate hint, Margem estimada (green >50 / yellow 30–50 / red <30), Novos tenants, Crescimento líquido (+N green / −N red / 0 neutral + breakdown hint)
  - [x] "Oportunidades de Upsell" table: Cliente, Plano, Uso (inline progress bar + %), Ação (`ContactButton` copies owner email — substitute for shadcn `Progress`/CRM)
  - [x] "Risco de Churn" table: Cliente, Qualidade (badge), Dias nesse status; red/yellow row tint; per-section empty state
  - [x] `AutoRefresh` client component calls `router.refresh()` every 5 min (AC#5); page is `force-dynamic`
  - [x] "Operacional" nav already present (Story 20.1)

- [x] Task 5: Tests (AC: #1, #2, #3, #4, #6)
  - [x] Unit: margin `(10000 − 500×5)/10000 = 75%` (`computeMarginPct`) + MRR=0 → 0
  - [x] Unit: `net_growth = new − churn` (3,1→2) and negative when churn>new (1,4→−3)
  - [x] Unit: near-limit threshold constant `0.8` asserted present in SQL (`NEAR_LIMIT_THRESHOLD`)
  - [x] Unit: quality query uses `whatsapp_connections` + PT-BR `amarelo`/`vermelho` + `status='conectado'`, and NOT `yellow`/`red` (enum-trap guard)
  - [~] non-workspace-admin 403: reinterpreted as the `(shell)/layout.tsx` guard (read-only page, no server action; same as 20.1)
  - [x] Component: margin badge green/yellow/red by threshold + net-growth +N/−N/0 (`presentation.test.ts`)
  - [x] Mapping: near-limit (usage %, owner email) + quality (days at risk) row coercion

## Dev Notes

- **Files to create:** `apps/api/src/routes/admin/operational-health.ts`, `apps/admin/app/(admin)/operacional/page.tsx`
- **Files to modify:** `apps/api/src/routes/admin/index.ts` (register route), `packages/config/src/schema.ts` (USD_TO_BRL_RATE), `.env.example`
- **`custo_ia_usd` visibility:** The `usage_counters.custo_ia_usd` column is only aggregated in the admin API — it must NOT appear in tenant-facing API responses (not even for owners). This is per NFR (FR108: visible only to super-admin).
- **Exchange rate:** V1 uses a fixed env var. V2 can fetch live rate from an exchange rate API. Document in `.env.example` that this needs manual updates.
- **"Entrar em contato" CTA:** For V1, clicking this copies the tenant owner's email to clipboard using `navigator.clipboard.writeText()`. Full CRM integration is out of scope.
- **Progress bar for usage:** Use shadcn/ui `Progress` component. `value = usage_pct`. Style: green ≤ 70%, yellow 71–90%, red > 90%.
- **`quality_rating` field in connections:** Stored as text. Valid values from Epic 4: `green`, `yellow`, `red`. Query only rows where `status = 'conectado'` — disconnected numbers don't have meaningful quality.
- **Margin formula assumes all revenue is BRL:** MRR is already in BRL (from Asaas). AI cost is in USD (from Anthropic). The formula converts USD to BRL using the rate. This is an estimate — actual margin depends on infra costs too (not modelled in V1).

### Testing standards

- Vitest unit tests for the margin calculation and risk signal queries
- Component test: KPI cards render with correct values from mocked API

### Pitfalls to avoid

- Do NOT expose `custo_ia_usd` per tenant in this endpoint — only the aggregate is shown.
- Do NOT use the tenant's local timezone for "current month" calculation — always use UTC or BRT consistently. Use `date_trunc('month', CURRENT_DATE)` in PostgreSQL which runs in the DB timezone (verify Supabase is set to UTC).
- The near-limit threshold (80%) is a business rule that might change. Define it as a constant (`const NEAR_LIMIT_THRESHOLD = 0.8`) rather than a magic number in the SQL.

### References

- [Source: docs/01-leedi-arquitetura.md#6.12 Domínio Billing + Usage] (usage_counters schema — custo_ia_usd)
- [Source: _bmad-output/planning-artifacts/epics.md#Story 20.3, FR130–FR133]
- [Source: _bmad-output/implementation-artifacts/20-1-financial-health-dashboard-mrr-revenue-delinquencies.md] (requireWorkspaceAdmin, MRR query to reuse)
- [Source: _bmad-output/implementation-artifacts/4-3-connection-health-display-status-quality-tier.md] (quality_rating field in connections)
- [Source: _bmad-output/implementation-artifacts/16-1-conversation-counting-usage-counter.md] (usage_counters schema, conversas_limite)

## Dev Agent Record

### Agent Model Used

claude-opus-4-8 (BMad Dev)

### Completion Notes List

- **Architecture override (same as 20.1/20.2, approved):** server-component page at `/operacional` + `getOperationalHealth` use-case in `@leedi/billing`. No Hono `apps/api/src/routes/admin/*`. AC#6 ("non-admin → 403") satisfied by the `(shell)/layout.tsx` super_admin guard (server-component path; no public endpoint exists).
- **Enum traps fixed (verified against the real schema, NOT the story text):** table is `whatsapp_connections` (story said `connections`); `quality_rating` is PT-BR `verde`/`amarelo`/`vermelho` (story said `yellow`/`red`) → risk filter = `amarelo`/`vermelho`; `subscriptions.status` PT-BR; `tenants` columns English (`name`/`plan`). A test asserts the SQL uses the PT-BR values and NOT the English ones.
- **No fan-out:** aggregates run as 3 separate queries (usage / tenants / subscriptions) rather than the story's single multi-JOIN, which would double-count `conversas`/`custo_ia` against multiple subscriptions.
- **Margin is pure + injected rate:** `computeMarginPct(mrrBrl, aiCostUsd, rate)` is exported and unit-tested; `usdToBrlRate` is passed in from `env.USD_TO_BRL_RATE` so the use-case has no env coupling. MRR=0 returns 0 (no NaN on a fresh workspace).
- **`custo_ia_usd` stays super-admin only (FR108):** only the aggregate is returned here; never exposed per-tenant.
- **`days_at_risk` is approximate (AC#4 partial):** derived from `whatsapp_connections.updated_at`, which is not a rating-transition timestamp (the 4.3 health-check path doesn't bump it on rating change, and no `quality_rating_changed_at` column exists). A write-path fix was prepared and **reverted by the user** to avoid modifying the shipped 4.3 path / adding a migration to the mid-flight journal. The at-risk *list* is exact; only the day count is a proxy. **Follow-up:** add `quality_rating_changed_at` (+ bump on transition) when the migration journal is consolidated, then switch the query to it.
- **UI substitutions (documented like 20.1/20.2):** `@leedi/ui` has no `Progress`/`Tooltip`/`Badge` → inline usage progress bar, `<span title>`/hint text, inline status badges. `refetchInterval` realised as an `AutoRefresh` client component (`router.refresh()` every 5 min) over the `force-dynamic` server page. "Entrar em contato" copies the owner email to the clipboard (V1 scope).
- **Verification:** `@leedi/billing` 26 tests pass (8 new), `@leedi/admin` 18 tests pass (3 new operacional), `@leedi/config` 5 pass, typecheck + eslint clean (billing/config/admin), `next build` succeeds with `/operacional` as a Dynamic route.

### File List

- `packages/billing/src/use-cases/get-operational-health.ts` (new)
- `packages/billing/src/__tests__/get-operational-health.test.ts` (new)
- `packages/billing/src/index.ts` (modified — export `getOperationalHealth`, `computeMarginPct`, `NEAR_LIMIT_THRESHOLD` + types)
- `packages/config/src/schema.ts` (modified — add `USD_TO_BRL_RATE`)
- `.env.example` (modified — add `USD_TO_BRL_RATE`)
- `apps/admin/app/(shell)/operacional/page.tsx` (new)
- `apps/admin/app/(shell)/operacional/ContactButton.tsx` (new)
- `apps/admin/app/(shell)/operacional/AutoRefresh.tsx` (new)
- `apps/admin/app/(shell)/operacional/presentation.ts` (new)
- `apps/admin/app/(shell)/operacional/presentation.test.ts` (new)
- `apps/admin/messages/pt-BR.json` (modified — add `operacional` namespace)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (modified — `20-3` → review)

### Change Log

- 2026-06-08: Implemented Story 20.3 — super-admin Operacional dashboard (aggregate conversations + AI cost, estimated margin with fixed USD→BRL rate, new tenants + net growth, upsell-opportunity and churn-risk signals). `getOperationalHealth` use-case in `@leedi/billing` + server-component page with auto-refresh (override of the story's Hono design). Status → review.
