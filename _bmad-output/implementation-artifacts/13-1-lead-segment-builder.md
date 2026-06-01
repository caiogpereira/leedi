---
baseline_commit: 9ea8a05
---

# Story 13.1: Lead Segment Builder

Status: ready-for-dev

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

- [ ] Task 1: Segments API (AC: #2, #3, #5, #6)
  - [ ] Create `apps/api/src/routes/segments/index.ts` (Hono router)
  - [ ] `GET /segments` — list all tenant segments with lead count preview
  - [ ] `POST /segments` — create segment; validate: `nome` required, `filtros` must have at least 1 key (AC: #5)
  - [ ] `GET /segments/:id` — single segment with metadata
  - [ ] `GET /segments/:id/preview` — execute the segment filter query and return `{ count, leads: [top 20] }` (AC: #3, #4)
  - [ ] `PATCH /segments/:id` — update nome or filtros
  - [ ] `DELETE /segments/:id` — check no active dispatch_jobs reference this segment; reject with 409 if found (AC: #6)
  - [ ] Create use cases: `apps/api/src/use-cases/segments/evaluate-segment.ts` (the filter execution logic — reused in dispatch and preview)
  - [ ] Register router in `apps/api/src/app.ts` behind `admin` RBAC guard
- [ ] Task 2: Segment filter evaluation engine (AC: #3, #4)
  - [ ] In `evaluate-segment.ts`, build a dynamic SQL query from the `filtros` jsonb:
    - `comprou: true|false` → `leads.comprou = ?`
    - `tag: ["tag1", "tag2"]` → `EXISTS (SELECT 1 FROM lead_tags WHERE lead_id = leads.id AND tag_name = ANY(?))`
    - `origem: "instagram"` → `leads.origem ILIKE ?`
    - `data_captura_inicio` / `data_captura_fim` → `leads.created_at BETWEEN ? AND ?`
  - [ ] Always scope to `tenant_id` — never evaluate cross-tenant
  - [ ] Exclusion filters (for dispatch): `comprou: false` (if flag set), `optout: false`, no active `conversation_window` — these are applied at dispatch execution time (Story 13.2), not at segment preview time
  - [ ] Return a Drizzle query builder that can be used both for count and for paginated lead lists
- [ ] Task 3: Segment builder UI (AC: #1, #2, #3, #5)
  - [ ] Create `apps/dashboard/app/(shell)/disparos/segmentos/page.tsx` — segments list
  - [ ] Create `apps/dashboard/app/(shell)/disparos/segmentos/new/page.tsx` — segment creation form
  - [ ] Filter builder component: a dynamic row-based UI where each row is a filter type + value
    - "Adicionar filtro" button adds a new row with a type selector dropdown
    - Each row has a type selector and a value input appropriate for that type
    - Types: Comprou (toggle: Sim/Não), Tag (multi-select combobox), Origem (text), Período de captura (date range)
  - [ ] "Visualizar leads" button triggers `GET /segments/:id/preview` (after save) or `POST /segments/preview` (before save, with `filtros` in body) — show count badge and collapsible lead list
  - [ ] Validation: disable "Salvar" if no filters added
  - [ ] Segment list: table with name, filter summary, lead count (refreshed at page load), actions (edit, delete, preview)
- [ ] Task 4: Tests (AC: #2, #3, #5, #6)
  - [ ] Unit: `evaluate-segment` generates correct SQL for each filter type
  - [ ] Unit: `evaluate-segment` with combined filters generates AND-joined conditions
  - [ ] Unit: `POST /segments` with empty `filtros` → 422 validation error
  - [ ] Integration: create segment, import leads matching filters, call preview → count matches
  - [ ] Integration: `DELETE /segments/:id` blocked when referenced by active dispatch_job

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

_not yet assigned_

### Debug Log References

_none_

### Completion Notes List

_not yet implemented_

### File List

_not yet implemented_

### Change Log

_none_
