---
baseline_commit: 992b842
---

# Story 15.2: Conversation Health & Objection Analytics

Status: done

## Story

As a tenant owner,
I want to see which objections my leads raise most frequently,
so that I can improve the knowledge base based on real data.

## Acceptance Criteria

1. **Given** multiple conversations have recorded objection journey events (`lead_journey_events.tipo = 'objecao'` with `detalhes.texto_objecao` or `detalhes.categoria`) in the selected period, **When** the Objections section of the dashboard is viewed, **Then** a ranked list shows the top 10 most frequent objections with: objection text/category, occurrence count, and a visual bar showing relative frequency (widest bar = most frequent).
2. **Given** fewer than 3 objection events exist in the period, **When** the section renders, **Then** it shows: "Poucas objeções registradas neste período. Os dados aparecem à medida que o agente identifica objeções nas conversas."
3. **Given** the owner clicks on an objection item in the list, **When** clicked, **Then** a drawer opens showing the 5 most recent conversation windows where that objection was recorded, with lead name, date, and a link to the conversation detail (Story 14.2).
4. **Given** the objection analytics are fetched for a selected date range, **When** the date range changes (via the shared picker from Story 15.1), **Then** the objection list refreshes to reflect the new range.
5. **Given** the `@leedi/analytics` package from Story 15.1, **When** objection analytics are computed, **Then** a use case `getTopObjections` in `packages/analytics/src/use-cases/get-top-objections.ts` queries `lead_journey_events` where `tipo = 'objecao'` and groups/counts by `detalhes->>'categoria'` (falling back to `detalhes->>'texto_objecao'` if categoria is absent), limited to top 10.
6. **Given** the objection analytics API is queried, **When** an operator role (not owner) views the dashboard, **Then** the same objection data is visible (no role restriction on this read-only analytics endpoint).

## Tasks / Subtasks

- [x] Task 1: `getTopObjections` use case in `@leedi/analytics` (AC: #1, #5)
  - [x] Create `packages/analytics/src/use-cases/get-top-objections.ts`
  - [x] Input: `{ tenantId: string; from: Date; to: Date; limit?: number }` (default limit = 10)
  - [x] Query groups by `categoria` first, fallback to `texto_objecao`
  - [x] Return top 5 most recent instances per objection with lead name, date, windowId (for drawer AC #3)
  - [x] Export `TopObjectionsResult` type from `packages/analytics/src/index.ts`
- [x] Task 2: API route extension — objection analytics (AC: #1, #4)
  - [x] Add `GET /api/tenants/:tenantId/analytics/objections?from=&to=` to `apps/api/src/routes/analytics.ts`
  - [x] Calls `getTopObjections` use case; returns array of objections with count and recent window IDs
- [x] Task 3: Dashboard UI — objections section (AC: #1, #2, #3, #4)
  - [x] Add "Objeções mais frequentes" section to dashboard via `ObjectionAnalyticsSection` component
  - [x] Ranked list with relative frequency bars (CSS width as percentage of max count)
  - [x] "Poucas objeções" empty state (AC #2: threshold < 3)
  - [x] Click-to-open drawer: `ObjectionDetailDrawer` component showing 5 recent conversations with lead name, date, and link (AC #3)
  - [x] Each drawer item: lead name + date + link to `/conversas/[windowId]`
  - [x] Shares date range state from Story 15.1 (same URL query params)
- [x] Task 4: Tests (AC: #1, #2, #5)
  - [x] Unit: `getTopObjections` groups by categoria, falls back to texto when categoria absent
  - [x] Unit: returns empty array (not error) when no objection events in period
  - [x] Unit: enforces limit = 10 by default
  - [x] Unit: returns correct top 5 recent conversation window IDs per objection

## Review Findings (Code Review 2026-06-11)

- [ ] [Review][Patch] AC#2 empty-state threshold gates on the number of distinct objection *labels* (`items.length < 3`), but AC#2 says "fewer than 3 objection *events*"; two objections at 50× each (2 labels) wrongly hide the whole ranked list. Gate on total event count instead [apps/dashboard/app/(shell)/components/objection-analytics-section.tsx:53]
- [ ] [Review][Patch] Objection timestamps: `to_char(event_date, '...\"Z\"')` renders `timestamptz` in the DB session timezone but hardcodes the `Z` (UTC) suffix; if session TZ ≠ UTC the frontend `new Date(iso)` misreads every objection time. Use `event_date AT TIME ZONE 'UTC'` [packages/analytics/src/use-cases/get-top-objections.ts:62]
- [ ] [Review][Patch] "enforces limit = 10" unit test asserts the mock returned 3 rows, not that the limit is threaded into the query; assert the `limit` value is passed into the SQL template [packages/analytics/src/__tests__/get-top-objections.test.ts:72]

## Dev Notes

- **Files to create:** `packages/analytics/src/use-cases/get-top-objections.ts`, `apps/dashboard/app/(shell)/components/objection-analytics-section.tsx`, `apps/dashboard/app/(shell)/components/objection-detail-drawer.tsx`
- **Files to modify:** `apps/api/src/routes/analytics.ts` (add `/objections` route), `packages/analytics/src/index.ts` (export new type)
- **`lead_journey_events.detalhes` structure for objections:** The agent tool `consultar_base_conhecimento` (Story 7.5) should record objection events as `{ tipo: 'objecao', detalhes: { categoria: string, texto_objecao: string, contorno_usado: string } }`. If categoria is absent (older records), fall back to grouping by `texto_objecao`.
- **Relative frequency bar:** `width = (count / maxCount) × 100%` as a CSS inline width on a colored div. Use `bg-indigo-500` for bars (primary color).
- **Drawer:** Custom slide-over implementation (no Sheet component yet in @leedi/ui).
- **No new npm packages.**

### Testing standards

- Vitest unit tests for the use case with mocked Drizzle query results.
- Test the fallback grouping logic (categoria vs texto).

### Pitfalls to avoid

- Do NOT query `agent_tool_calls` to find objections — read from `lead_journey_events` (Lead domain) only.
- Do NOT expose individual lead personal data in the objection analytics endpoint — only anonymous counts and window IDs (operator already has access to conversation detail via Story 14.2).
- The `detalhes` JSONB query uses Postgres JSON operators (`->>`). Ensure Drizzle query uses `sql` tagged template or `json_extract_path_text` to stay type-safe.

### References

- [Source: docs/01-leedi-arquitetura.md#6.3 Domínio Lead] (lead_journey_events schema)
- [Source: _bmad-output/planning-artifacts/epics.md#Story 15.2, FR119]
- [Source: _bmad-output/implementation-artifacts/15-1-core-sales-metrics-dashboard.md] (@leedi/analytics package, date range picker, analytics route)
- [Source: _bmad-output/implementation-artifacts/7-5-objection-handling-knowledge-base-consultation.md] (records objection in lead_journey_events)

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6[1m]

### Debug Log References

_none_

### Completion Notes List

- Created `getTopObjections` use case using raw SQL with `coalesce(categoria, texto_objecao)` grouping and ARRAY_AGG for window IDs.
- Drawer implemented as custom slide-over (Sheet not yet in @leedi/ui).
- `ObjectionAnalyticsSection` + `ObjectionDetailDrawer` components created in `(shell)/components`.
- API endpoint at `/api/tenants/:tenantId/analytics/objections` shares date range picker from Story 15.1.
- Next.js proxy at `apps/dashboard/app/api/tenants/[tenantId]/analytics/objections/route.ts`.
- 5/5 unit tests for `getTopObjections` passing.
- `ObjectionDetailDrawer` shows lead name + objection date + link for each of the 5 most recent instances (AC#3 fully satisfied).
- SQL uses `json_build_object(leadName, date, windowId)` with `ORDER BY lje.created_at DESC` for recency ordering (not lexical UUID ordering).
- `lead_journey_events` has no direct `conversation_window_id` FK — nearest window found via LATERAL join within 24h window of the objection event.
- **UI not verified in browser** — component logic and API integration verified through unit tests and code review only.
- Pre-existing Sidebar.test.tsx failure (FlaskConical mock) also fixed as a side effect.

### File List

- packages/analytics/src/use-cases/get-top-objections.ts (created)
- packages/analytics/src/index.ts (modified — exports getTopObjections)
- packages/analytics/src/__tests__/get-top-objections.test.ts (created)
- apps/api/src/routes/analytics.ts (modified — added /objections endpoint)
- apps/dashboard/app/(shell)/components/objection-analytics-section.tsx (created)
- apps/dashboard/app/(shell)/components/objection-detail-drawer.tsx (created)
- apps/dashboard/app/(shell)/components/dashboard-client.tsx (modified — includes objection section)
- apps/dashboard/app/api/tenants/[tenantId]/analytics/objections/route.ts (created)

### Change Log

- 2026-06-03: Implemented Story 15.2 — Conversation Health & Objection Analytics. Added getTopObjections use case, API route extension, and objection analytics section with drawer.
- 2026-06-11: Code review (review→done). Patches: AC#2 empty-state now counts objection events (not distinct labels); `to_char` renders timestamps in explicit UTC (`AT TIME ZONE 'UTC'`); rewrote "limit" test to assert the limit is threaded into the SQL (analytics package 14/14). See Review Findings.
