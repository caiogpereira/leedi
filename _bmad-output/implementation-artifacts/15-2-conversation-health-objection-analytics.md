---
baseline_commit: 9ea8a05
---

# Story 15.2: Conversation Health & Objection Analytics

Status: ready-for-dev

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

- [ ] Task 1: `getTopObjections` use case in `@leedi/analytics` (AC: #1, #5)
  - [ ] Create `packages/analytics/src/use-cases/get-top-objections.ts`
  - [ ] Input: `{ tenantId: string; from: Date; to: Date; limit?: number }` (default limit = 10)
  - [ ] Query: `SELECT detalhes->>'categoria' AS categoria, detalhes->>'texto_objecao' AS texto, COUNT(*) AS count FROM lead_journey_events WHERE tenant_id = ? AND tipo = 'objecao' AND created_at BETWEEN ? AND ? GROUP BY categoria, texto ORDER BY count DESC LIMIT ?`
  - [ ] Merge rows by `categoria` first (same category = same objection type), fallback to `texto` for ungrouped
  - [ ] Also return top 5 recent `conversation_window_id` values per objection (for the drawer in AC #3)
  - [ ] Export `TopObjectionsResult` type from `packages/analytics/src/index.ts`
- [ ] Task 2: API route extension — objection analytics (AC: #1, #4)
  - [ ] Add `GET /api/analytics/objections?from=&to=` to `apps/api/src/routes/analytics.ts`
  - [ ] Calls `getTopObjections` use case; returns array of objections with count and recent window IDs
- [ ] Task 3: Dashboard UI — objections section (AC: #1, #2, #3, #4)
  - [ ] Add "Objeções mais frequentes" section to `apps/dashboard/app/(dashboard)/page.tsx`
  - [ ] Ranked list with relative frequency bars (CSS width as percentage of max count)
  - [ ] "Poucas objeções" empty state (AC #2: threshold < 3)
  - [ ] Click-to-open drawer: `ObjectionDetailDrawer` component showing 5 recent conversations
  - [ ] Each drawer item: lead name, date, link to `/conversas/[windowId]`
  - [ ] Shares date range state from Story 15.1 (same `useSearchParams` hook, same query key date range)
- [ ] Task 4: Tests (AC: #1, #2, #5)
  - [ ] Unit: `getTopObjections` groups by categoria, falls back to texto when categoria absent
  - [ ] Unit: returns empty array (not error) when no objection events in period
  - [ ] Unit: enforces limit = 10 by default
  - [ ] Unit: returns correct top 5 recent conversation window IDs per objection

## Dev Notes

- **Files to create:** `packages/analytics/src/use-cases/get-top-objections.ts`, `apps/dashboard/app/(dashboard)/components/objection-analytics-section.tsx`, `apps/dashboard/app/(dashboard)/components/objection-detail-drawer.tsx`
- **Files to modify:** `apps/api/src/routes/analytics.ts` (add `/objections` route), `packages/analytics/src/index.ts` (export new type)
- **`lead_journey_events.detalhes` structure for objections:** The agent tool `consultar_base_conhecimento` (Story 7.5) should record objection events as `{ tipo: 'objecao', detalhes: { categoria: string, texto_objecao: string, contorno_usado: string } }`. If categoria is absent (older records), fall back to grouping by `texto_objecao`.
- **Relative frequency bar:** `width = (count / maxCount) × 100%` as a CSS inline width on a colored div. Use `bg-indigo-500` for bars (primary color).
- **Drawer:** Use shadcn/ui `Sheet` component from `@leedi/ui`.
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

_not yet assigned_

### Debug Log References

_none_

### Completion Notes List

_not yet implemented_

### File List

_not yet implemented_

### Change Log

_none_
