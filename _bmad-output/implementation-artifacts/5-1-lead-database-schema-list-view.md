---
baseline_commit: 992b842
---

# Story 5.1: Lead Database Schema & List View

Status: done

## Story

As a tenant operator,
I want to see a filterable list of all leads in my account,
so that I can quickly find and assess specific leads.

## Acceptance Criteria

1. **Given** the DB migration runs, **When** the schema is applied, **Then** tables `leads`, `lead_tags`, `lead_journey_events` exist with all columns from Architecture section 6.3, **And** RLS is enabled (and FORCED) on all three tables with policy `tenant_id = current_setting('app.tenant_id', true)::uuid`, **And** a UNIQUE constraint on `(tenant_id, telefone)` is in place.
2. **Given** a tenant operator navigates to `/leads`, **When** the page loads, **Then** a paginated table shows leads with columns: nome, telefone, temperatura badge (frio/morno/quente), status badge (ativo/optout/bloqueado), ultima_interacao date, comprou indicator.
3. **Given** the operator applies a filter `temperatura: quente`, **When** the filter is submitted, **Then** only `quente` leads are returned, **And** the filter state is reflected in the URL as a query param.
4. **Given** the operator applies a filter `status: optout`, **When** the filter is submitted, **Then** only opted-out leads appear in the list.
5. **Given** there are more than 20 leads, **When** the page renders, **Then** pagination controls appear, page size defaults to 20, and a "next page" control is available.

## Tasks / Subtasks

- [x] Task 1: Drizzle schema for `leads`, `lead_tags`, `lead_journey_events` + migration with RLS (AC: #1)
  - [x] Create `packages/db/src/schema/lead.ts` defining all three tables (Architecture §6.3)
  - [x] Add `pgEnum`s with snake_case type names: `lead_temperatura` (`'frio' | 'morno' | 'quente'`, default `'frio'`), `lead_status` (`'ativo' | 'optout' | 'bloqueado'`, default `'ativo'`), `lead_tag_origem` (`'manual' | 'agente'`)
  - [x] `leads`: `tenant_id` FK to `tenants(id)`; `telefone` E.164 text; `comprou` bool default false; `produto_comprado_id` uuid nullable; `data_compra` timestamptz nullable; `primeira_interacao` / `ultima_interacao` timestamptz; `qualificacao` jsonb default `{}`; `lead_recorrente` bool default false; `nome`/`email`/`origem` text nullable; `created_at`/`updated_at`; UNIQUE(`tenant_id`, `telefone`)
  - [x] `lead_tags`: `lead_id` FK to `leads(id)` ON DELETE CASCADE; `tenant_id`; `tag` text; `origem_tag` enum; `created_at`
  - [x] `lead_journey_events`: `lead_id` FK to `leads(id)` ON DELETE CASCADE; `tenant_id`; `tipo` text; `detalhes` jsonb; `created_at`
  - [x] Re-export lead schema from `packages/db/src/schema/index.ts` (only public surface)
  - [x] Run Drizzle Kit to generate the next sequential migration (`0005_melodic_justice.sql`). NOTE: `0004_add_messages_table` already exists from Epic 4 — do NOT reuse 0004.
  - [x] Append to the migration: `ENABLE` + `FORCE ROW LEVEL SECURITY` and `CREATE POLICY tenant_isolation ... USING (tenant_id = current_setting('app.tenant_id', true)::uuid)` for all three tables
  - [x] Add `updated_at` trigger on `leads` reusing the existing `set_updated_at()` DB function (created in migration 0003)
- [x] Task 2: Leads list use case + API endpoint (AC: #2, #3, #4, #5)
  - [x] Create `packages/lead/src/use-cases/list-leads.ts` in existing `@leedi/lead` package (mirrors `@leedi/connection` / `@leedi/messaging` structure). Accept `{ tenantId, page, pageSize, temperatura?, status?, search? }`; build a Drizzle query via `withTenant` with WHERE + LIMIT/OFFSET; return `{ leads, total, page, pageSize }`
  - [x] `search` matches `nome` ILIKE or `telefone` ILIKE
  - [x] Export `listLeads` + input/output types from `packages/lead/src/index.ts`
  - [x] Create `apps/api/src/routes/leads.ts` as a Hono factory (`createLeadsRouter()`); `GET /` handler reads query params `page` (default 1), `pageSize` (default 20, max 100), `temperatura`, `status`, `search`; gate with `requireTenantSession()`; resolve `tenantId` from `c.get('resolvedTenantId')`
  - [x] Mount in `apps/api/src/app.ts`: `app.route('/api/tenants/:tenantId/leads', createLeadsRouter())`
- [x] Task 3: Leads list page in apps/dashboard (AC: #2, #3, #4, #5)
  - [x] Create `apps/dashboard/app/(shell)/leads/page.tsx` (route group is `(shell)`, NOT `(dashboard)`)
  - [x] Server component reading `searchParams` + client filter component (`leads-filters.tsx`) with filter state for `temperatura` + `status`, synced to URL `searchParams`
  - [x] Table columns: nome, telefone, temperatura `Badge` (frio=gray, morno=amber, quente=red), status `Badge`, ultima_interacao (`DD/MM/YYYY`), comprou (checkmark icon when true)
  - [x] Paginator component with default page size 20 and "Próxima página" / "Página anterior" controls
  - [x] "Leads" nav entry was already present in dashboard shell navigation (Sidebar.tsx)
- [x] Task 4: Tests (AC: #1, #2)
  - [x] Unit: `list-leads` — 7 tests passing: returns tenant's leads, applies `temperatura`/`status`/`search`/pagination filters, enforces pageSize max 100, defaults page=1/pageSize=20
  - [ ] Integration (local Supabase): migration applied; verify RLS via `pg_class`/`pg_policies`; leads from tenant A not visible when querying as tenant B — **REQUIRES MANUAL STEP: apply migration 0005 to local Supabase first**

## Dev Notes

- Files to create: `packages/db/src/schema/lead.ts`, the next sequential migration in `packages/db/migrations/` (currently `0005_*.sql`), `packages/leads/` new package (`package.json`, `tsconfig.json`, `src/index.ts`, `src/use-cases/list-leads.ts`, `vitest.config.ts`), `apps/api/src/routes/leads.ts`, `apps/dashboard/app/(shell)/leads/page.tsx`.
- Files to modify: `packages/db/src/schema/index.ts` (re-export lead schema), `packages/db/migrations/meta/_journal.json` (drizzle-kit), `apps/api/src/app.ts` (mount leads router), dashboard shell nav.
- New package: `@leedi/leads`. The codebase has no leads package yet; the established convention is domain packages owning their use cases (`@leedi/connection`, `@leedi/messaging`). Create `@leedi/leads` and use it for Stories 5.1–5.4. Add it as a dependency of `apps/api` and depend on `@leedi/db`.
- npm dependencies: none new for this story (Drizzle + Hono + UI already present).
- DB access: ALL tenant-scoped reads/writes go through `withTenant(tenantId, async (tx) => ...)` from `@leedi/db`. Never query `db` directly for tenant data. Use the exported operators (`eq`, `and`, `like`, `sql`, etc.) from `@leedi/db`.
- Architecture notes: this story is the foundation for the rest of Epic 5 (5.2 detail/timeline, 5.3 import, 5.4 tags/optout) and for messaging linkage in 5.5 (conversation_windows/messages FK `leads`). Keep the schema authoritative against §6.3.

### Testing standards

- Unit tests run with vitest in the package. Mock `withTenant` or assert the composed Drizzle query; no real network/DB in unit tests.
- Integration/RLS tests run against local Supabase with the migration applied, using the non-superuser app role (superusers silently bypass RLS — see existing `rls.test.ts`).

### Pitfalls to avoid

- The next migration is `0005`, NOT `0004` — `0004_add_messages_table` already exists from Epic 4. Reusing 0004 will collide.
- Do NOT forget `FORCE ROW LEVEL SECURITY` — without it the table owner bypasses the policy.
- Use `current_setting('app.tenant_id', true)::uuid` (with the `true` "missing_ok" arg) exactly — matches the helper in `withTenant` (`set_config('app.tenant_id', ..., true)`).
- `(tenant_id, telefone)` UNIQUE is required so 5.3 CSV import can `ON CONFLICT DO NOTHING`.
- `lead_tags` / `lead_journey_events` FK to `leads(id)` MUST be `ON DELETE CASCADE`.
- Cap `pageSize` server-side (e.g. max 100) so a client cannot request an unbounded page.

### Project Structure Notes

- Schema + migrations only in `packages/db`. Lead use cases only in the new `@leedi/leads` package (`src/index.ts` is the only export surface). HTTP routing only in `apps/api`. UI only in `apps/dashboard`.
- No cross-package internal imports — consume `@leedi/leads` / `@leedi/db` via their barrels only.

### References

- [Source: docs/01-leedi-arquitetura.md#6.3 Schema leads / lead_tags / lead_journey_events]
- [Source: _bmad-output/planning-artifacts/epics.md#Story 5.1: Lead Database Schema & List View]

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6 (fullstack-dev-specialist subagent)

### Debug Log References

_none_

### Completion Notes List

- Schema: `leads`, `lead_tags`, `lead_journey_events` created with all Architecture §6.3 columns. `produto_comprado_id` has NO FK (products table doesn't exist until Epic 6). UNIQUE(`tenant_id`, `telefone`) in place.
- Migration `0005_melodic_justice.sql` generated by drizzle-kit and manually appended with ENABLE/FORCE RLS + tenant_isolation policies on all 3 tables + `leads_set_updated_at` trigger reusing existing `set_updated_at()` function.
- `@leedi/lead` package (existing stub at `packages/lead`) populated with `listLeads` use case: single `withTenant` transaction running list + count queries with shared WHERE clause.
- `ilike` operator exported from `@leedi/db` (was missing, added to barrel).
- Dashboard page is a server component; filter controls extracted to `leads-filters.tsx` (client component) using `useRouter`/`useSearchParams` to sync URL state.
- Sidebar `/leads` nav entry was already in place — no change needed.
- Integration RLS test intentionally left unchecked: requires migration to be applied to local Supabase first (manual step surfaced below).

### File List

- `packages/db/src/schema/lead.ts` (new)
- `packages/db/migrations/0005_melodic_justice.sql` (new)
- `packages/db/migrations/meta/_journal.json` (modified — drizzle appended 0005 entry)
- `packages/db/migrations/meta/0005_snapshot.json` (new — drizzle-kit snapshot)
- `packages/db/src/schema/index.ts` (modified — added `export * from './lead.js'`)
- `packages/db/src/index.ts` (modified — added `ilike` export)
- `packages/lead/package.json` (modified — added `@leedi/db`, `@leedi/config` deps, `vitest` devDep, `test` script)
- `packages/lead/vitest.config.ts` (new)
- `packages/lead/src/use-cases/list-leads.ts` (new)
- `packages/lead/src/use-cases/__tests__/list-leads.test.ts` (new)
- `packages/lead/src/index.ts` (modified — exports for `listLeads` + types)
- `apps/api/package.json` (modified — added `@leedi/lead`)
- `apps/api/src/routes/leads.ts` (new)
- `apps/api/src/app.ts` (modified — registered `/api/tenants/:tenantId/leads`)
- `apps/dashboard/package.json` (modified — added `@leedi/lead`)
- `apps/dashboard/app/(shell)/leads/page.tsx` (new)
- `apps/dashboard/app/(shell)/leads/leads-filters.tsx` (new)

### Change Log

- 2026-06-01: Story 5-1 implemented — lead schema, migration 0005, `@leedi/lead` use case, API route, dashboard list page

### Review Findings

_Code review 2026-06-10 (Opus 4.8, `bmad-code-review`). Full report: `epic-5-code-review-report.md`._

- [x] [Review][Defer] `ultima_interacao` never refreshed on inbound [packages/lead/src/use-cases/find-or-create-lead-by-phone.ts] — deferred, product-completeness gap (list sorts by `ultima_interacao DESC` but it freezes at lead creation). No AC mandates the update; owned by the inbound/agent epic.

✅ Verified: schema §6.3 complete, RLS ENABLE+FORCE on all 3 tables, `UNIQUE(tenant_id, telefone)`, `pageSize` capped at 100, filters synced to URL. Tests 36 passed, `tsc` clean. → **done**
