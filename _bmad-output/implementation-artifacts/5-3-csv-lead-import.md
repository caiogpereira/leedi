---
baseline_commit: 9ea8a05
---

# Story 5.3: CSV Lead Import

Status: review

## Story

As a tenant operator,
I want to import leads from a CSV file,
so that I can seed my lead base from an external list.

## Acceptance Criteria

1. **Given** an operator uploads a CSV with a `telefone` column (required) and optional `nome`, `email` columns, **When** the import is processed, **Then** new leads are created for rows with valid phones not already in the DB, **And** rows with a phone already in the tenant's `leads` table are skipped (deduplicated by `telefone`), **And** an import summary shows: "X leads importados, Y duplicados ignorados, Z erros."
2. **Given** a CSV row has a malformed phone number (not E.164 normalizable), **When** the import is processed, **Then** that row appears in the errors list with reason "Telefone inválido", **And** valid rows in the same file are still imported.
3. **Given** a CSV with a missing `telefone` column header, **When** the file is submitted, **Then** validation returns the error "Coluna 'telefone' obrigatória não encontrada no arquivo."
4. **Given** an operator uploads a CSV with 500 rows, **When** processed, **Then** all rows are handled within 30 seconds and the result summary is returned.
5. **Given** duplicate rows within the same CSV file (same `telefone` appearing twice), **When** imported, **Then** only the first occurrence is inserted and the second is counted as a duplicate.

## Tasks / Subtasks

- [x] Task 1: CSV parsing utility (AC: #1, #2, #3, #5)
  - [x] `apps/api/src/utils/parse-leads-csv.ts` with papaparse — returns `{ valid, errors, duplicates }`; throws `CsvValidationError` when telefone column missing
  - [x] E.164 normalization with BR heuristics (+55 prefix for 11-digit numbers); in-file dedup by normalized telefone
  - [x] 9 unit tests in `apps/api/src/utils/__tests__/parse-leads-csv.test.ts`
- [x] Task 2: Import use case (AC: #1, #4, #5)
  - [x] `packages/lead/src/use-cases/import-leads-csv.ts` — chunks of 100, `.onConflictDoNothing()` (no named target — composite UNIQUE handles it)
  - [x] origem: 'csv_import', status: 'ativo'; counts inserted via `.returning({ id })`
  - [x] Returns `{ inserted, duplicated, errors }` (in-file dupes separate from DB conflicts)
- [x] Task 3: CSV import API endpoint (AC: #1, #3, #4)
  - [x] `POST /import` added to `apps/api/src/routes/leads.ts`, 5MB limit, multipart/form-data via `c.req.parseBody()`
  - [x] 400 on missing telefone column, 400 on oversized file
- [x] Task 4: CSV import UI (AC: #1, #2)
  - [x] `apps/dashboard/app/(shell)/leads/import/page.tsx` (server shell) + `import-form.tsx` (client)
  - [x] File input (.csv), loading state, 3 counters (green/amber/red), "Baixar relatório de erros" CSV download
  - [x] Same-origin proxy via `apps/dashboard/app/api/tenants/[tenantId]/leads/import/route.ts`
  - [x] "+ Importar CSV" link added to leads list page
- [x] Task 5: Tests — 9 parse-leads-csv tests + import-leads-csv mock test

## Dev Notes

- Files to create: `apps/api/src/utils/parse-leads-csv.ts`, `packages/leads/src/use-cases/import-leads-csv.ts`, `apps/dashboard/app/(shell)/leads/import/page.tsx`.
- Files to modify: `apps/api/src/routes/leads.ts` (add `POST /import`), `packages/leads/src/index.ts` (export `importLeadsCsv`), `apps/api/package.json` (+ `papaparse`).
- npm dependencies: `papaparse` (+ `@types/papaparse` dev) for CSV parsing in `apps/api`. E.164 normalization can use a lightweight approach (regex + `+55` prefix) or `libphonenumber-js` if already present — do not add a heavy phone lib unless needed; prefer the minimal approach for the Brazilian default.
- DB: insert via `withTenant`; conflict target is the `(tenant_id, telefone)` UNIQUE constraint from 5.1. Reuse the `leads` schema/enums from `@leedi/db`.
- Architecture notes: depends on Story 5.1 (leads schema + `@leedi/leads` package + UNIQUE constraint). Phone normalization here should be consistent with how inbound webhook (Story 4.4) stores `lead_phone` (E.164 with `+`).

### Testing standards

- Unit tests with vitest. Build fixtures as in-memory CSV strings; assert parse output and use-case counts. Mock `withTenant` for the use-case unit test.
- No real network. A local-Supabase integration test for `onConflictDoNothing` behavior is optional but recommended.

### Pitfalls to avoid

- Dedup happens at TWO levels: in-file (parser, first wins) AND DB (`onConflictDoNothing` on `(tenant_id, telefone)`). Both must count toward "duplicados".
- A single bad row must NOT abort the whole import — partial success is required (AC #2). Collect errors, insert the valid set.
- Enforce the 5MB limit BEFORE buffering the whole file in memory if possible; reject oversized uploads early.
- Normalize phones consistently with the rest of the system (E.164, `+55` default for BR) so imported leads match inbound-created leads and dedup actually works.
- Do NOT log full CSV contents (may contain PII — LGPD). Log only counts and row indices for errors.
- The conflict target must be the composite `(tenant_id, telefone)`, not `telefone` alone.

### Project Structure Notes

- CSV parsing utility lives in `apps/api` (HTTP/request concern). The insert use case lives in `@leedi/leads` via `withTenant`. UI in `apps/dashboard`.

### References

- [Source: docs/01-leedi-arquitetura.md#6.3 Schema leads]
- [Source: _bmad-output/planning-artifacts/epics.md#Story 5.3: CSV Lead Import]

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6 (fullstack-dev-specialist subagent)

### Debug Log References

_none_

### Completion Notes List

- Dedup at two levels: in-file (parser, first wins → `duplicates` bucket) AND DB (onConflictDoNothing on UNIQUE(tenant_id, telefone) → counted in `duplicated`). ErrorRow only counts malformed phones.
- A same-origin Next.js proxy route handles the dashboard→API forwarding to avoid cross-port cookie issues
- The API base URL derivation (`:3000`→`:3003`) follows the existing `webhook-meta.ts` pattern

### File List

- `apps/api/src/utils/parse-leads-csv.ts` (new)
- `apps/api/src/utils/__tests__/parse-leads-csv.test.ts` (new)
- `packages/lead/src/use-cases/import-leads-csv.ts` (new)
- `packages/lead/src/use-cases/__tests__/import-leads-csv.test.ts` (new)
- `packages/lead/src/index.ts` (modified — added importLeadsCsv + types)
- `apps/api/src/routes/leads.ts` (modified — added POST /import)
- `apps/api/package.json` (modified — added papaparse + @types/papaparse)
- `apps/dashboard/app/(shell)/leads/import/page.tsx` (new)
- `apps/dashboard/app/(shell)/leads/import/import-form.tsx` (new)
- `apps/dashboard/app/api/tenants/[tenantId]/leads/import/route.ts` (new)
- `apps/dashboard/app/(shell)/leads/page.tsx` (modified — "+ Importar CSV" link)

### Change Log

- 2026-06-01: Story 5-3 implemented — CSV import utility, use case, API endpoint, dashboard UI
