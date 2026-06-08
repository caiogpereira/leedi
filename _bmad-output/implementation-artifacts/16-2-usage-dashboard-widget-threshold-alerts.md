---
baseline_commit: 992b842
---

# Story 16.2: Usage Dashboard Widget & Threshold Alerts

Status: review

## Story

As a tenant operator,
I want to see my conversation usage clearly and receive alerts before I hit my limit,
so that I can plan and avoid surprises.

## Acceptance Criteria

1. **Given** a tenant has used 830 of 1,000 conversations in the current month, **When** they view the dashboard (or the Usage section), **Then** a usage widget shows: "830 / 1.000 conversas (83%)" with a labeled progress bar. The bar is styled: 0–79% → `bg-green-500`, 80–94% → `bg-amber-500`, 95–99% → `bg-orange-500`, ≥100% → `bg-red-500`.
2. **Given** overage conversations exist (`overage_conversas > 0`), **When** the widget renders, **Then** it additionally shows in orange: "Conversas excedentes: X (R$ Y,00 extra)" below the progress bar.
3. **Given** the tenant views the Usage section at `/uso` (standalone page) or via the dashboard widget, **When** they click "Ver histórico", **Then** a table shows the last 6 months of `usage_counters` records with: period (formatted), `conversas_usadas`, `conversas_limite`, `overage_conversas`, `overage_valor`.
4. **Given** `usage_counters.conversas_usadas` reaches 80% of `conversas_limite` for the first time in a period, **When** the threshold is crossed (detected during `incrementUsage` in Story 16.1), **Then** notification is dispatched via `alertsDue` return value. The threshold is only triggered once per period per level (80%, 95%, 100%).
5. **Given** usage reaches 95% and then 100%, **When** each threshold is crossed, **Then** a separate notification call is made with the respective percentage.
6. **Given** a threshold notification was already sent for a given period and level, **When** `incrementUsage` runs again, **Then** no duplicate notification is sent. Deduplication via `alertas_enviados` jsonb column.
7. **Given** the usage widget is shown on the main dashboard page, **When** the widget API call fails, **Then** it shows: "Dados de uso indisponíveis." without breaking other dashboard widgets.

## Tasks / Subtasks

- [x] Task 1: Add alert deduplication to `usage_counters` (AC: #6)
  - [x] `alertas_enviados` jsonb column included in migration 0015 (added upfront with 16.1)
- [x] Task 2: Threshold alert logic in `incrementUsage` (AC: #4, #5, #6)
  - [x] Implemented in `packages/usage/src/use-cases/increment-usage.ts`
  - [x] Returns `alertsDue` to keep `@leedi/notification` out of `@leedi/usage`
  - [x] Atomic `UPDATE WHERE NOT (alertas_enviados @> ...)` prevents duplicate sends
  - [x] Caller (`webhook-meta.ts`) fires `alertsDue` notifications via `createNotificationStub()`
- [x] Task 3: API routes — usage widget + history (AC: #1, #2, #3, #7)
  - [x] `GET /api/tenants/:tenantId/usage/current` → returns counter (no `custoIaUsd`)
  - [x] `GET /api/tenants/:tenantId/usage/history?limit=N` → last N periods
  - [x] Registered in `apps/api/src/app.ts`
- [x] Task 4: Usage widget UI (AC: #1, #2, #7)
  - [x] `apps/dashboard/app/(shell)/components/usage-widget.tsx` — progress bar (color coded) + overage row + error state + "Ver histórico" link
  - [x] Added to `dashboard-client.tsx` with 60s polling
- [x] Task 5: Usage history page (AC: #3)
  - [x] `apps/dashboard/app/(shell)/uso/page.tsx` + `usage-history-client.tsx` — table with formatted periods and BRL values
- [x] Task 6: Tests (AC: #1, #4, #5, #6)
  - [x] 6 component tests for `UsageWidget` (loading, error, counts, overage, link)
  - [x] Threshold dedup + alert logic covered in `increment-usage.test.ts` (16.1 tests)
  - [x] API route tests in `src/routes/__tests__/usage.test.ts`

## Dev Notes

- **Files created:** `apps/api/src/routes/usage.ts`, `apps/dashboard/app/(shell)/components/usage-widget.tsx`, `apps/dashboard/app/(shell)/uso/page.tsx`, `apps/dashboard/app/(shell)/uso/usage-history-client.tsx`
- **Files modified:** `apps/api/src/app.ts`, `apps/dashboard/app/(shell)/components/dashboard-client.tsx`
- **Notification pattern:** `incrementUsage` returns `alertsDue` — caller fires notifications to avoid importing `@leedi/notification` in `@leedi/usage` (which would transitively load the Resend adapter)

### References

- [Source: docs/01-leedi-arquitetura.md#6.12 Domínio Billing + Usage]
- [Source: _bmad-output/planning-artifacts/epics.md#Story 16.2, FR104, FR105]

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

_none_

### Completion Notes List

- `alertas_enviados` jsonb column was included in migration 0015 from the start (16.1 and 16.2 share the schema)
- Threshold alerts use `alertsDue` return pattern to avoid static `@leedi/notification` import in `@leedi/usage`
- Dashboard widget uses 60s interval polling (no TanStack Query — consistent with existing dashboard pattern)
- Period formatting uses native `Intl` / `Date.toLocaleDateString('pt-BR', ...)` — no date-fns dep needed
- Fixed pre-existing bug in `require-role.ts`: was reading `ctx.get('role')` but should be `ctx.get('tenantRole')` (set by `requireTenantSession`)

### File List

- apps/api/src/routes/usage.ts (new)
- apps/api/src/routes/__tests__/usage.test.ts (new)
- apps/api/src/app.ts (modified)
- apps/api/src/middleware/require-role.ts (bug fix: role → tenantRole)
- apps/dashboard/app/(shell)/components/usage-widget.tsx (new)
- apps/dashboard/app/(shell)/components/__tests__/usage-widget.test.tsx (new)
- apps/dashboard/app/(shell)/components/dashboard-client.tsx (modified)
- apps/dashboard/app/(shell)/uso/page.tsx (new)
- apps/dashboard/app/(shell)/uso/usage-history-client.tsx (new)
- apps/dashboard/package.json (modified — added @leedi/usage)

### Change Log

- 2026-06-03: Story 16.2 implemented — usage widget, history page, API routes, threshold alert infrastructure
