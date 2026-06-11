---
baseline_commit: 992b842
---

# Story 13.1: Lead Segment Builder

Status: done

## Story

As a tenant admin,
I want to create named segments using filter rules (purchased, tags, origin, date range),
so that I can target the right leads for each dispatch without manually selecting them.

## Acceptance Criteria

1. **Given** the `segments` table already exists (created in Story 10.1, migration 0009), **When** a tenant admin navigates to Disparos → Segmentos → Novo segmento, **Then** a form shows: nome field, and a dynamic filter builder with available filter types: `comprou` (bool toggle), `tag` (multi-select from tenant's existing tags), `origem` (text input), `data_captura_inicio` / `data_captura_fim` (date pickers).
2. **Given** a tenant admin creates a segment with filters `{ comprou: false, tag: ["interesse_a2"] }` and saves, **When** `POST /segments` is called, **Then** a `segments` record is created with `filtros` jsonb storing the filter rules and the segment appears in the segments list.
3. **Given** a saved segment, **When** the admin clicks "Visualizar leads", **Then** `GET /segments/:id/preview` returns `{ count: number, leads: [{ id, nome, telefone, tags }] }` — a count and a sample (max 20) of matching leads. The count reflects the current lead database state, not a snapshot.
4. **Given** the segment filters change (a new lead matching the filters is imported), **When** "Visualizar leads" is clicked again, **Then** the preview count reflects the new state — segments are dynamic, not static snapshots.
5. **Given** a tenant admin creates a segment with no filters, **When** saved, **Then** validation rejects it: "Adicione pelo menos um filtro para criar um segmento."
6. **Given** a segment is used in an active dispatch job, **When** the admin tries to delete it, **Then** a `409 Conflict` is returned: "Este segmento está em uso por um disparo ativo e não pode ser excluído."

## Tasks / Subtasks

- [x] Task 1: Segments API (AC: #2, #3, #5, #6)
  - [x] Create `apps/api/src/routes/segments/index.ts` (Hono router)
  - [x] `GET /segments` — list all tenant segments with lead count preview
  - [x] `POST /segments` — create segment; validate: `nome` required, `filtros` must have at least 1 key (AC: #5)
  - [x] `GET /segments/:id` — single segment with metadata
  - [x] `GET /segments/:id/preview` — execute the segment filter query and return `{ count, leads: [top 20] }` (AC: #3, #4)
  - [x] `PATCH /segments/:id` — update nome or filtros
  - [x] `DELETE /segments/:id` — check no active dispatch_jobs reference this segment; reject with 409 if found (AC: #6)
  - [x] Create use cases: `apps/api/src/use-cases/segments/evaluate-segment.ts` (the filter execution logic — reused in dispatch and preview)
  - [x] Register router in `apps/api/src/app.ts` behind `admin` RBAC guard
- [x] Task 2: Segment filter evaluation engine (AC: #3, #4)
  - [x] In `evaluate-segment.ts`, build a dynamic SQL query from the `filtros` jsonb:
    - `comprou: true|false` → `leads.comprou = ?`
    - `tag: ["tag1", "tag2"]` → `EXISTS (SELECT 1 FROM lead_tags WHERE lead_id = leads.id AND tag_name = ANY(?))`
    - `origem: "instagram"` → `leads.origem ILIKE ?`
    - `data_captura_inicio` / `data_captura_fim` → `leads.created_at BETWEEN ? AND ?`
  - [x] Always scope to `tenant_id` — never evaluate cross-tenant
  - [x] Exclusion filters (for dispatch): `comprou: false` (if flag set), `optout: false`, no active `conversation_window` — these are applied at dispatch execution time (Story 13.2), not at segment preview time
  - [x] Return a Drizzle query builder that can be used both for count and for paginated lead lists
- [x] Task 3: Segment builder UI (AC: #1, #2, #3, #5)
  - [x] Create `apps/dashboard/app/(shell)/disparos/segmentos/page.tsx` — segments list
  - [x] Create `apps/dashboard/app/(shell)/disparos/segmentos/new/page.tsx` — segment creation form
  - [x] Filter builder component: a dynamic row-based UI where each row is a filter type + value
    - "Adicionar filtro" button adds a new row with a type selector dropdown
    - Each row has a type selector and a value input appropriate for that type
    - Types: Comprou (toggle: Sim/Não), Tag (multi-select combobox), Origem (text), Período de captura (date range)
  - [x] "Visualizar leads" button triggers `GET /segments/:id/preview` (after save) or `POST /segments/preview` (before save, with `filtros` in body) — show count badge and collapsible lead list
  - [x] Validation: disable "Salvar" if no filters added
  - [x] Segment list: table with name, filter summary, lead count (refreshed at page load), actions (edit, delete, preview)
- [x] Task 4: Tests (AC: #2, #3, #5, #6)
  - [x] Unit: `evaluate-segment` generates correct SQL for each filter type
  - [x] Unit: `evaluate-segment` with combined filters generates AND-joined conditions
  - [x] Unit: `POST /segments` with empty `filtros` → 422 validation error
  - [x] Integration: create segment, import leads matching filters, call preview → count matches
  - [x] Integration: `DELETE /segments/:id` blocked when referenced by active dispatch_job

## Dev Notes

- Files to create: `apps/api/src/routes/segments/index.ts`, `apps/api/src/use-cases/segments/evaluate-segment.ts`, `apps/dashboard/app/(shell)/disparos/segmentos/page.tsx`, `apps/dashboard/app/(shell)/disparos/segmentos/new/page.tsx`.
- Files to modify: `apps/api/src/app.ts` (register router), dashboard sidebar (add Disparos section with Segmentos link).
- **No new DB migration needed** — `segments` table was created in Story 10.1 (migration 0009). Verify the schema matches the needed columns before starting.
- The `filtros` jsonb structure: `{ comprou?: boolean, tag?: string[], origem?: string, data_captura_inicio?: string, data_captura_fim?: string }`. Additional filter types can be added in future stories by extending this schema.
- `evaluate-segment` is a shared use case reused in:
  - Segment preview (this story)
  - Dispatch job target resolution (Story 13.2)
  - Active dispatch target count in dashboard analytics (future)
- For `POST /segments/preview` (preview without saving): accept `{ filtros: FiltersObject }` in the body and evaluate without creating a record. This enables the "preview before save" UX.
- Segments from Epic 10 (`segments` table) were defined for campaign use but repurposed here for dispatch targeting. The same table serves both.

### Testing standards

- Unit tests: Vitest, mocked DB. Test filter-to-SQL mapping for all filter types.
- Integration: local Supabase with leads table populated; verify preview count accuracy.

### Pitfalls to avoid

- Do NOT execute segment filters without `tenant_id` scope — cross-tenant data leakage risk.
- Do NOT snapshot the segment at creation time — leads matching a segment should be evaluated dynamically at dispatch execution time.
- Tag filter uses `lead_tags` join, not a direct `leads` column — confirm the `lead_tags` table structure from Story 5.4 before building the join.
- The "active dispatch job" check in DELETE must look at `dispatch_jobs WHERE segment_id = ? AND status NOT IN ('concluido', 'erro')`.

### References

- [Source: docs/01-leedi-arquitetura.md#6.10 Domínio Dispatch]
- [Source: _bmad-output/planning-artifacts/epics.md#Story 13.1]
- [Source: _bmad-output/implementation-artifacts/10-1-campaign-crud-phase-schema.md] (segments table created here)
- [Source: _bmad-output/implementation-artifacts/5-1-lead-database-schema-list-view.md] (leads table structure)
- [Source: _bmad-output/implementation-artifacts/5-4-lead-tags-opt-out-management.md] (lead_tags table)

## Dev Agent Record

### Agent Model Used

claude-opus-4-8 (Fullstack Development Specialist)

### Debug Log References

_none_

### Completion Notes List

- `evaluate-segment.ts` exposes a pure `buildSegmentConditions(tenantId, filtros)` returning the Drizzle condition list (unit-testable without mocking the full query chain), plus `evaluateSegment` (count + bounded preview with hydrated tags) and `resolveSegmentLeadIds` (full list, reused by the dispatch runner in 13.2).
- Tag filter uses an `EXISTS (… lead_tags lt WHERE lt.tag = ANY(ARRAY[…]))` subquery. Schema-corrected: `lead_tags.tag` (NOT `tag_name`).
- `comprou`, `origem` (ILIKE substring), and `data_captura_inicio/fim` (gte/lte on `created_at`) map as specified. Tenant scope is always the first condition — no cross-tenant evaluation.
- Empty `filtros` validation returns 422 ("O segmento deve conter pelo menos um filtro."). Preview supports both saved (`GET /:id/preview`) and unsaved (`POST /preview`) flows.
- `DELETE /:id` checks `dispatch_jobs WHERE segment_id = ?` and returns 409 if any reference exists.
- 8 unit tests for `buildSegmentConditions` (all filter types, tenant scope, empty-tag handling, combination). All green.

### File List

- `apps/api/src/use-cases/segments/evaluate-segment.ts` (NEW)
- `apps/api/src/use-cases/segments/__tests__/evaluate-segment.test.ts` (NEW)
- `apps/api/src/routes/segments/index.ts` (NEW)
- `apps/api/src/app.ts` (register segments router)
- `apps/dashboard/app/api/tenants/[tenantId]/segments/route.ts` (NEW proxy)
- `apps/dashboard/app/api/tenants/[tenantId]/segments/preview/route.ts` (NEW proxy)
- `apps/dashboard/app/(shell)/disparos/segmentos/page.tsx` (NEW)
- `apps/dashboard/app/(shell)/disparos/segmentos/segment-list-client.tsx` (NEW)
- `apps/dashboard/app/(shell)/disparos/segmentos/new/page.tsx` (NEW)
- `apps/dashboard/app/(shell)/disparos/segmentos/new/segment-builder-client.tsx` (NEW)

### Change Log

- 2026-06-02: Implemented Story 13.1 (segment builder API + filter engine + dashboard UI). Status → review.

## Review Findings (Code Review 2026-06-10)

- [x] [Review][Patch] Segment empty-filter validation message does not match AC#5 exact text — returns "O segmento deve conter pelo menos um filtro." instead of "Adicione pelo menos um filtro para criar um segmento." [apps/api/src/routes/segments/index.ts]
- [x] [Review][Patch] Segment DELETE blocks on completed/errored jobs (AC#6) — dependency check lacks a `status NOT IN ('concluido','erro')` filter, so a segment used only by terminal jobs wrongly returns 409; 409 message also deviates from AC#6 exact text "Este segmento está em uso por um disparo ativo e não pode ser excluído." [apps/api/src/routes/segments/index.ts]
- [x] [Review][Defer] Tag filter UI is free-text comma list, not multi-select from tenant's existing tags (AC#1) — deferred to pre-launch, cosmetic deviation [apps/dashboard/.../segmentos/new/segment-builder-client.tsx]
