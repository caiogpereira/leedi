---
baseline_commit: 9ea8a05
---

# Story 20.3: Operational Health (Conversations, AI Cost, Risk Signals)

Status: ready-for-dev

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

- [ ] Task 1: `GET /api/admin/operational-health` endpoint (AC: #1–#4, #6)
  - [ ] Create `apps/api/src/routes/admin/operational-health.ts`
  - [ ] `requireWorkspaceAdmin()` guard
  - [ ] Aggregate KPIs query (extend to include churn for net growth):
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

- [ ] Task 2: `USD_TO_BRL_RATE` env var (AC: #2)
  - [ ] Add `USD_TO_BRL_RATE: z.coerce.number().default(5.0)` to `packages/config/src/schema.ts`
  - [ ] Update `.env.example` with `USD_TO_BRL_RATE=5.0  # Update manually when rate changes significantly`

- [ ] Task 3: Days at risk calculation for quality (AC: #4)
  - [ ] The `connections` table tracks `quality_rating` and `updated_at` (timestamp of last rating change from Story 4.3)
  - [ ] "Days at rating" = `CURRENT_DATE - DATE(c.updated_at)` when the rating is yellow/red
  - [ ] Add this computation to the quality risk query: `CURRENT_DATE - DATE(c.updated_at) AS days_at_risk`

- [ ] Task 4: Admin Operacional page (AC: #1–#5)
  - [ ] Create `apps/admin/app/(admin)/operacional/page.tsx`
  - [ ] Top KPI grid (3x2, 5 cards + 1 spacer or 3x2 responsive):
    - "Conversas este mês" — total across all tenants
    - "Custo IA (USD)" — formatted as $X,XXX.XX + "(R$ Y,YYY,YY ao câmbio de [rate])"
    - "Margem estimada" — `{marginPct.toFixed(1)}%` — green if > 50%, yellow if 30–50%, red if < 30%
    - "Novos tenants este mês" — count
    - "Crescimento líquido" — `net_growth` formatted as "+N" (green) or "-N" (red) or "0" (neutral); tooltip: "Novos tenants menos cancelamentos no mês: +{new} -{churn}"
  - [ ] "Oportunidades de Upsell" section: table with columns "Tenant", "Plano", "Uso" (progress bar + %), "Ação" (CTA button "Entrar em contato" — opens email compose with tenant owner email pre-filled, or just copies email to clipboard for V1)
  - [ ] "Risco de Churn" section: table with columns "Tenant", "Qualidade do número" (badge: yellow/red), "Dias nesse status"
    - Red rows for `quality_rating = 'red'`, yellow rows for `'yellow'`
    - Empty state for each section if no at-risk tenants: "Nenhum tenant neste status."
  - [ ] `refetchInterval: 5 * 60 * 1000` (5 minutes) — data is not real-time but refreshes automatically
  - [ ] Add "Operacional" to admin nav (already done in Story 20.1)

- [ ] Task 5: Tests (AC: #1, #2, #3, #4, #6)
  - [ ] Unit: margin calculation with `mrr = 10000 BRL`, `ai_cost = 500 USD`, `rate = 5.0` → margin = `(10000 - 2500) / 10000 = 75%`
  - [ ] Unit: `net_growth = new_tenants - churn_this_month` (e.g., 3 new, 1 churn → net_growth = 2)
  - [ ] Unit: `net_growth` is negative when churn > new tenants
  - [ ] Unit: near-limit query returns tenants at ≥80% usage, excludes those at 79.9%
  - [ ] Unit: quality risk query includes `yellow` and `red` connections, excludes `green` and `desconectado`
  - [ ] Unit: non-workspace-admin receives 403
  - [ ] Component: margin badge renders green/yellow/red based on threshold
  - [ ] Component: net growth card renders "+N" in green, "-N" in red, "0" in neutral gray

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

_not yet assigned_

### Debug Log References

_none_

### Completion Notes List

_not yet implemented_

### File List

_not yet implemented_

### Change Log

_none_
