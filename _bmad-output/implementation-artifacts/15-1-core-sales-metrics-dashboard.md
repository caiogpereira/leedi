---
baseline_commit: 992b842
---

# Story 15.1: Core Sales Metrics Dashboard

Status: review

## Story

As a tenant owner,
I want to see my key sales metrics on the main dashboard,
so that I know at a glance how the agent is performing commercially.

## Acceptance Criteria

1. **Given** a tenant owner views the Dashboard page (`/dashboard`), **When** the page loads with the current calendar month as the default date range, **Then** the following metrics are displayed: "Conversas iniciadas" (count of `conversation_windows` with `billable = true` in period), "Taxa de resposta" (% of conversations where at least one `messages.autor = 'lead'` followed an outbound message), "Conversões" (count of `gateway_events.evento_canonico = 'compra_aprovada'` in period attributed to agent), "Valor total de vendas" (sum of purchase values from `gateway_events` in period), "Ticket médio" (Valor total / Conversões, shown as "—" when Conversões = 0), "ROI estimado" (see AC #3).
2. **Given** a date range picker is shown in the dashboard header, **When** the owner selects a different month or custom range, **Then** all metric cards update to reflect the selected period. The selected range is reflected in the URL (`?from=2026-05-01&to=2026-05-31`).
3. **Given** ROI is calculated as: `ROI = Valor total de vendas / (Conversas iniciadas × R$0.10)`, **When** rendered, **Then** the "ROI estimado" card shows the ratio formatted as "X.X×" (e.g., "12.5×"). A tooltip explains: "ROI estimado com base em custo fixo de R$0,10 por conversa. O custo real pode variar." When Conversas iniciadas = 0, shows "—".
4. **Given** a new `compra_aprovada` gateway event is processed for the tenant, **When** the dashboard is polled (TanStack Query `refetchInterval: 60000`), **Then** "Conversões" and "Valor total de vendas" update within 60 seconds.
5. **Given** a `@leedi/analytics` package is created for this domain, **When** any metric is queried, **Then** it uses read-only use cases in `@leedi/analytics` that query across `conversation_windows`, `messages`, `gateway_events`, and `leads` tables — no raw queries in the route handler.
6. **Given** the tenant has no data for the selected period, **When** metrics are computed, **Then** all cards show "0" (not errors), and a subtle banner shows: "Nenhuma atividade neste período."
7. **Given** "Valor total de vendas" is queried from `gateway_events`, **When** a `compra_aprovada` event does not have a `valor` field in `payload_normalizado`, **Then** it is counted as a conversion but excluded from value totals (counted with null-safe SUM).

## Tasks / Subtasks

- [x] Task 1: Create `@leedi/analytics` package (AC: #5)
  - [x] Create `packages/analytics/package.json`, `packages/analytics/src/index.ts`
  - [x] Create `packages/analytics/src/use-cases/get-tenant-sales-metrics.ts`
  - [x] Input: `{ tenantId: string; from: Date; to: Date }`
  - [x] Output: `TenantSalesMetrics` type with all 6 metric fields (typed, not any)
  - [x] Query `conversation_windows` for `conversas_iniciadas` (billable=true, created_at in range)
  - [x] Query `messages` + `conversation_windows` for `taxa_resposta` (% windows with ≥1 lead reply after outbound)
  - [x] Query `gateway_events` for `conversoes` (compra_aprovada, created_at in range) and `valor_total`
  - [x] Compute `ticket_medio` = valor_total / conversoes (handle 0 case)
  - [x] Compute `roi_estimado` = valor_total / (conversas_iniciadas × 0.10) (handle 0 case)
  - [x] Add to `pnpm-workspace.yaml`; re-export from `packages/analytics/src/index.ts`
- [x] Task 2: API route — dashboard metrics endpoint (AC: #1, #2, #6, #7)
  - [x] Create `apps/api/src/routes/analytics.ts`
  - [x] `GET /api/tenants/:tenantId/analytics/sales?from=&to=` — validates date range, calls `getTenantSalesMetrics` use case
  - [x] Returns `TenantSalesMetrics` JSON; 400 if date range invalid (e.g., range > 366 days)
  - [x] Register in `apps/api/src/app.ts`
- [x] Task 3: Dashboard page UI (AC: #1, #2, #3, #4, #6)
  - [x] Update or create `apps/dashboard/app/(shell)/page.tsx`
  - [x] 6 `MetricCard` components in a responsive grid (2-col mobile, 3-col desktop)
  - [x] `MetricCard` props: `{ label, value, subtext?, tooltip? }` — created in dashboard
  - [x] Date range picker in page header (month selector + optional custom range); sync with URL via `useSearchParams`
  - [x] Polling via `useEffect` + `setInterval` at 60s interval
  - [x] ROI card tooltip with cost disclaimer (AC #3)
  - [x] Empty state banner when all metrics are 0 (AC #6)
- [x] Task 4: Tests (AC: #1, #3, #5)
  - [x] Unit: `getTenantSalesMetrics` returns correct counts for mocked data
  - [x] Unit: ROI formula handles division by zero correctly (returns null)
  - [x] Unit: `taxa_resposta` correctly identifies windows with lead reply after outbound
  - [x] Unit: `valor_total` SUM is null-safe (gateway events with no valor are excluded from sum, not from count)
  - [x] Unit: date range validation rejects ranges > 366 days

## Dev Notes

- **Files to create:** `packages/analytics/package.json`, `packages/analytics/src/index.ts`, `packages/analytics/src/use-cases/get-tenant-sales-metrics.ts`, `apps/api/src/routes/analytics.ts`, `apps/dashboard/app/(shell)/page.tsx` (update existing shell), `apps/dashboard/app/(shell)/components/metric-card.tsx`
- **Files to modify:** `apps/api/src/app.ts` (register analytics route), `pnpm-workspace.yaml` (add analytics package)
- **ROI formula:** `ROI = Valor total / (conversas_iniciadas × 0.10)`. The R$0.10 per-conversation cost is a fixed constant (not pulled from DB). Document as a constant `ESTIMATED_COST_PER_CONVERSATION_BRL = 0.10` in the use case.
- **FR108 compliance:** `usage_counters.custo_ia_usd` is NEVER exposed to the tenant-facing API or dashboard. Only the estimated ROI (using fixed cost) is shown. Real AI cost is only visible in Epic 20 (super-admin).
- **"Valor total de vendas"** comes from `gateway_events.payload_normalizado`. The normalizado payload from Story 11.1 must include `valor` (numeric, BRL). If the HotMart event has no value, it's null — use `COALESCE(valor, 0)` or filter null in SUM.
- **Attribution:** "conversions attributed to agent" = all `compra_aprovada` events for leads that had at least one `conversation_window` in the period. V0 attribution is simple (any purchase in period, regardless of which touchpoint closed it). V2 can add last-touch attribution.
- **Performance:** All metrics queries should be computed on-the-fly for V0. Add note: "Materialize with Postgres views or scheduled aggregation when query latency > 500ms."
- **No new npm packages** beyond existing stack.

### Testing standards

- Pure Vitest unit tests for `getTenantSalesMetrics` (mock DB client, no real DB needed).
- Test all edge cases: empty period, zero conversions, zero conversations, missing `valor` in gateway events.

### Pitfalls to avoid

- Do NOT expose `custo_ia_usd` from `usage_counters` in any tenant-facing endpoint — this violates FR108.
- Do NOT count playground `conversation_windows` (`billable = false`) in "Conversas iniciadas".
- The `taxa_resposta` computation is tricky — a "reply" means the lead sent at least one message after an outbound agent message within the same window. Don't count windows where the only messages are inbound (lead writes, agent hasn't responded yet — that's pending, not "replied").

### References

- [Source: docs/01-leedi-arquitetura.md#6.4 Domínio Messaging] (conversation_windows, messages)
- [Source: docs/01-leedi-arquitetura.md#6.11 Domínio Gateway] (gateway_events, compra_aprovada)
- [Source: docs/01-leedi-arquitetura.md#6.12 Domínio Billing + Usage] (usage_counters — do NOT expose custo_ia_usd)
- [Source: _bmad-output/planning-artifacts/epics.md#Story 15.1, FR113–FR118]
- [Source: _bmad-output/implementation-artifacts/5-5-conversation-window-tracking-24h-billing-unit.md] (billable flag)
- [Source: _bmad-output/implementation-artifacts/11-1-hotmart-webhook-receiver-canonical-event-normalization.md] (gateway_events schema, payload_normalizado)

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6[1m]

### Debug Log References

_none_

### Completion Notes List

- Created `@leedi/analytics` package with `getTenantSalesMetrics` use case. Exports `computeSalesMetrics` pure function for testability.
- `taxa_resposta` uses raw SQL with EXISTS subquery to handle partitioned messages table safely.
- Value field in `payload_normalizado` is `value` (from HotmartNormalizer), not `valor` — null-safe SUM with `nullif(..., '')`.
- Dashboard page replaced simple placeholder with `DashboardClient` server+client component pattern.
- Date range picker syncs with URL via `useSearchParams`. Polling at 60s via `useEffect`+`setInterval` (no TanStack Query — not in project stack).
- API route mounted at `/api/tenants/:tenantId/analytics/sales` with 366-day range validation.
- Next.js proxy route created at `apps/dashboard/app/api/tenants/[tenantId]/analytics/sales/route.ts`.
- 15/15 analytics package tests passing, 138/138 API tests passing.
- **UI not verified in browser** — component logic and API integration verified through unit tests and code review only. SQL metrics logic reviewed but not executed against Postgres; `taxa_resposta` EXISTS subquery and null-safe SUM logic reviewed as correct.

### File List

- packages/analytics/package.json (modified — added @leedi/db dep, vitest)
- packages/analytics/src/index.ts (modified — exports)
- packages/analytics/src/use-cases/get-tenant-sales-metrics.ts (created)
- packages/analytics/src/__tests__/get-tenant-sales-metrics.test.ts (created)
- packages/analytics/vitest.config.ts (created)
- apps/api/src/routes/analytics.ts (created)
- apps/api/src/app.ts (modified — register analytics router)
- apps/api/package.json (modified — added @leedi/analytics dep)
- apps/dashboard/app/(shell)/page.tsx (modified — full dashboard)
- apps/dashboard/app/(shell)/components/metric-card.tsx (created)
- apps/dashboard/app/(shell)/components/dashboard-client.tsx (created)
- apps/dashboard/app/api/tenants/[tenantId]/analytics/sales/route.ts (created)

### Change Log

- 2026-06-03: Implemented Story 15.1 — Core Sales Metrics Dashboard. Created @leedi/analytics package, API route, dashboard page with 6 metric cards, date range picker, and 60s polling.
