---
baseline_commit: 992b842
---

# Story 5.2: Lead Detail Page & Journey Timeline

Status: review

## Story

As a tenant operator,
I want to open a lead's detail page and see their complete journey,
so that I can understand the lead's history before contacting them.

## Acceptance Criteria

1. **Given** an operator clicks on a lead in the leads list, **When** the detail page opens at `/leads/[id]`, **Then** the following sections are visible: lead profile header (nome, telefone, email, origem, status badge), lead data section (temperatura, lead_recorrente, qualificacao jsonb), tags list, purchase history (comprou + produto_comprado_id + data_compra), and conversation count.
2. **Given** the lead has journey events in `lead_journey_events`, **When** the timeline section is rendered, **Then** all events appear in reverse-chronological order with: event type label in Portuguese (captado→"Lead captado", comprou→"Compra realizada", etc.), timestamp formatted as `DD/MM/YYYY HH:mm`, and `detalhes` rendered if present.
3. **Given** a lead with no journey events, **When** the timeline is rendered, **Then** an empty state shows: "Nenhum evento registrado ainda."
4. **Given** a lead whose status is `optout`, **When** the detail page renders, **Then** a warning banner is visible: "Este lead optou por não receber mensagens."

## Tasks / Subtasks

- [x] Task 1: Lead detail use case + API endpoint (AC: #1, #2)
  - [x] Create `packages/lead/src/use-cases/get-lead-detail.ts` — fetches lead + lead_tags (ASC) + lead_journey_events (DESC) via withTenant; UUID guard returns null for malformed ids
  - [x] Return `null` when lead not found → 404
  - [x] `conversationCount` defaults to 0 with TODO(Story 5.5) comment
  - [x] Export `getLeadDetail` + types from `packages/lead/src/index.ts`
  - [x] Added `GET /:id` to `apps/api/src/routes/leads.ts`, returns 404 `{ error: 'Lead não encontrado.' }` when null
- [x] Task 2: Lead detail page (AC: #1, #2, #3, #4)
  - [x] `apps/dashboard/app/(shell)/leads/[id]/page.tsx` server component shell
  - [x] Profile header, tags as Badge chips, lead data section (temperatura, lead_recorrente, qualificacao kv), purchase section
  - [x] Journey timeline with PT-BR labels + DD/MM/YYYY HH:mm timestamps; empty state "Nenhum evento registrado ainda."
  - [x] Optout warning banner driven strictly by `status === 'optout'`
- [x] Task 3: Breadcrumb "← Voltar para Leads" at top of detail page (AC: #1)
- [x] Task 4: Tests (AC: #1, #2)
  - [x] Unit: `get-lead-detail` — 4 tests: null for unknown lead, null for malformed UUID, correct shape (tags+events ordered DESC), conversationCount=0 always

## Dev Notes

- Files to create: `packages/leads/src/use-cases/get-lead-detail.ts`, `apps/dashboard/app/(shell)/leads/[id]/page.tsx`, optional `apps/dashboard/app/(shell)/leads/[id]/journey-timeline.tsx` (extracted component), a PT-BR label map module (e.g. `apps/dashboard/app/(shell)/leads/[id]/journey-labels.ts` or colocated).
- Files to modify: `apps/api/src/routes/leads.ts` (add `GET /:id`), `packages/leads/src/index.ts` (export `getLeadDetail`).
- npm dependencies: none new. Use a date helper already in the repo (or `Intl.DateTimeFormat('pt-BR')`) for `DD/MM/YYYY HH:mm` — do not add a new date lib if one is already present.
- Architecture notes: reuses the `@leedi/leads` package + `leads`/`lead_tags`/`lead_journey_events` schema from 5.1. `conversation_windows` is owned by 5.5 — keep the dependency one-directional (5.2 reads a count, defaulting to 0 until 5.5 exists).

### Testing standards

- Unit tests with vitest; mock `withTenant` or assert the query. No real DB/network in unit tests.
- Manual/UI verification of the page can use the existing dashboard dev flow; not required in CI.

### Pitfalls to avoid

- A lead from another tenant must never be returned — rely on `withTenant` + RLS, and still treat a missing row as 404 (do not leak existence across tenants via different status codes/messages beyond the standard 404).
- Journey events MUST be ordered `created_at DESC` (most recent first) per AC #2.
- The optout banner is driven strictly by `status === 'optout'`; do not infer it from journey events.
- Do not crash on a lead with `null` nome/email/origem or empty `qualificacao` `{}` — render graceful placeholders.
- `conversationCount` depends on a table that may not exist yet (5.5) — guard so 5.2 does not block on 5.5.

### Project Structure Notes

- Lead read logic stays in `@leedi/leads`; HTTP in `apps/api`; rendering in `apps/dashboard`. The PT-BR `tipo` label map is a presentation concern and lives in the dashboard, not in the use case.

### References

- [Source: docs/01-leedi-arquitetura.md#6.3 Schema leads / lead_tags / lead_journey_events]
- [Source: _bmad-output/planning-artifacts/epics.md#Story 5.2: Lead Detail Page & Journey Timeline]

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6 (fullstack-dev-specialist subagent)

### Debug Log References

_none_

### Completion Notes List

- `getLeadDetail` includes UUID guard (malformed id → null before any DB query) to prevent Postgres 500
- `conversationCount` is hard-coded to 0 with TODO(Story 5.5) — wired once conversation_windows exists
- Journey events ordered `created_at DESC` as required
- Optout banner driven strictly by `status === 'optout'`, not by journey events
- Leads list page updated to make nome/telefone cells clickable Links to `/leads/[id]`

### File List

- `packages/lead/src/use-cases/get-lead-detail.ts` (new)
- `packages/lead/src/use-cases/__tests__/get-lead-detail.test.ts` (new)
- `packages/lead/src/index.ts` (modified — added getLeadDetail + types)
- `apps/api/src/routes/leads.ts` (modified — added GET /:id)
- `apps/dashboard/app/(shell)/leads/[id]/page.tsx` (new)
- `apps/dashboard/app/(shell)/leads/page.tsx` (modified — added Link to detail page)

### Change Log

- 2026-06-01: Story 5-2 implemented — lead detail use case, API route, dashboard detail page with timeline
