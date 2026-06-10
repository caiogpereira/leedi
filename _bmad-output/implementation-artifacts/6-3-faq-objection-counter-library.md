---
baseline_commit: 992b842
---

# Story 6.3: FAQ & Objection-Counter Library

Status: done

## Story

As a tenant operator,
I want to build a library of FAQs and objection-counter pairs,
so that the agent responds consistently to common questions and handles predictable objections effectively.

## Acceptance Criteria

1. **Given** the `knowledge_base` table exists (created in Story 6.1), **When** an operator creates a new FAQ entry with `pergunta_ou_objecao` and `resposta_ou_contorno`, **Then** it is saved with `tipo='faq'` and appears in the FAQ list.
2. **Given** an operator creates an objection entry with `categoria` "preco", objection text "É muito caro", and counter text, **When** saved, **Then** it appears in the Objections section filtered by `categoria`.
3. **Given** an operator clicks the AI improvement button on an objection counter text and accepts the suggestion, **When** saved, **Then** `resposta_ou_contorno` is updated and a success toast shows: "Contorno atualizado com sucesso."
4. **Given** the operator filters the knowledge base by `categoria` "preco", **When** the filter is applied, **Then** only entries with `categoria='preco'` are shown.
5. **Given** the agent calls `consultar_base_conhecimento` with `categoria='preco'` (use case unit test), **When** executed, **Then** it returns all active `knowledge_base` entries matching `tipo='objecao'` and `categoria='preco'`.
6. **Given** an entry is deleted, **When** confirmed, **Then** it is soft-deleted (`ativo = false`) and disappears from the active list.

## Tasks / Subtasks

- [x] Task 1: Knowledge base use cases in `@leedi/knowledge` + thin API router (AC: #1, #2, #4, #6)
  - [x] Create use cases under `packages/knowledge/src/use-cases/`: `create-knowledge-entry.ts`, `list-knowledge-base.ts`, `update-knowledge-entry.ts`, `delete-knowledge-entry.ts` — all via `withTenant`; export from `packages/knowledge/src/index.ts`
  - [x] Create thin Hono router `apps/api/src/routes/knowledge/knowledge-base.ts` — calls `@leedi/knowledge` only; contains ZERO business logic
  - [x] `GET /knowledge-base?tipo=faq|objecao&categoria=` → calls `listKnowledgeBase`
  - [x] `POST /knowledge-base` → calls `createKnowledgeEntry`
  - [x] `PATCH /knowledge-base/:id` → calls `updateKnowledgeEntry`
  - [x] `DELETE /knowledge-base/:id` → calls `deleteKnowledgeEntry` (soft delete, `ativo = false`)
  - [x] Register the knowledge-base router in `apps/api/src/app.ts`
- [x] Task 2: `consultar_base_conhecimento` use case — agent tool foundation (AC: #5)
  - [x] Create `packages/knowledge/src/use-cases/search-knowledge-base.ts` (in `@leedi/knowledge`, NOT in `packages/db`)
  - [x] Signature: `searchKnowledgeBase(tenantId: string, opts: { tipo?: 'faq' | 'objecao'; categoria?: string; query?: string })`
  - [x] V1: keyword/exact match on `categoria` + `tipo` (optionally a simple ILIKE on `query` over the question/objection text); NO vector search (embedding stays unused)
  - [x] Returns an array of `{ perguntaOuObjecao, respostaOuContorno, tipo, categoria }` for active entries only
  - [x] All reads via `withTenant`; export from `packages/knowledge/src/index.ts`
- [x] Task 3: FAQ management UI (AC: #1, #3)
  - [x] Create `apps/dashboard/app/(shell)/conhecimento/faq/page.tsx`
  - [x] List of FAQ entries (`tipo='faq'`) with inline edit
  - [x] "Adicionar FAQ" form (`perguntaOuObjecao` + `respostaOuContorno`)
  - [x] AI improvement button on the answer field using the `AIAssistedTextarea` from `@leedi/ui` with `context="faq_answer"` (reuses the improve-text route extended in Story 6.2)
  - [x] Success toast on save: "Contorno atualizado com sucesso." for objection counters (and an appropriate FAQ-save toast)
- [x] Task 4: Objections management UI (AC: #2, #3, #4, #6)
  - [x] Create `apps/dashboard/app/(shell)/conhecimento/objecoes/page.tsx`
  - [x] Group entries (`tipo='objecao'`) by `categoria`; add a filter control by `categoria`
  - [x] Each entry shows objection + counter with edit + AI improve (`context="objection_counter"`) + delete (soft)
  - [x] "Adicionar objeção" form with a `categoria` selector: `preco | tempo | capacidade | outros`
  - [x] Toast on save: "Contorno atualizado com sucesso." (exact copy, AC #3)
  - [x] Delete confirmation dialog; on confirm, soft-delete and remove from the active list
- [x] Task 5: Tests (AC: #1, #5, #6)
  - [x] Unit: `search-knowledge-base` returns the correct entries filtered by `categoria` + `tipo`, active only
  - [x] Unit: `create-knowledge-entry` validates required fields (`tipo`, `perguntaOuObjecao`, `respostaOuContorno`)
  - [x] Unit: `delete-knowledge-entry` sets `ativo = false` (soft delete) and the entry no longer appears in `list-knowledge-base`

## Dev Notes

- Files to create: `packages/knowledge/src/use-cases/{create-knowledge-entry,list-knowledge-base,update-knowledge-entry,delete-knowledge-entry,search-knowledge-base}.ts` (all in `@leedi/knowledge`), `apps/api/src/routes/knowledge/knowledge-base.ts` (thin Hono router), `apps/dashboard/app/(shell)/conhecimento/faq/page.tsx`, `apps/dashboard/app/(shell)/conhecimento/objecoes/page.tsx`.
- Files to modify: `packages/knowledge/src/index.ts` (export `searchKnowledgeBase` and CRUD use cases), `apps/api/src/app.ts` (register knowledge-base router), `apps/api/src/routes/ai.ts` (ensure `faq_answer` and `objection_counter` are valid `context` values — coordinate with Story 6.2's context union).
- **CRITICAL-2 FIX:** All use cases (including `searchKnowledgeBase`) live in `packages/knowledge/` — not in `packages/db` or `apps/api`. Story 7.5's tool `consultar_base_conhecimento` imports `searchKnowledgeBase` from `@leedi/knowledge`.
- npm dependencies: none new — reuse `@leedi/db` (`withTenant`, `schema`, `eq`, `and`, `ilike`), `zod`, `@leedi/ui` (`AIAssistedTextarea`, `Select`, `Button`, toast/`Sonner`).
- The `knowledge_base` table and its RLS/trigger were created in Story 6.1's migration `0006_knowledge_schema.sql` — this story adds NO migration.
- The common objection categories `preco | tempo | capacidade | outros` are a UI selector convention; `categoria` is a free-text column (nullable), so do not add a DB enum for it.

### pgvector note

- `consultar_base_conhecimento` is keyword/exact-match in V1; the `embedding` column is intentionally unused. Do NOT add semantic/vector search in this story.

### Security considerations (multi-tenancy)

- All reads/writes go through `withTenant` so RLS isolates tenants (`knowledge_base` has `FORCE ROW LEVEL SECURITY` from Story 6.1).
- Soft delete (`ativo = false`) is the only delete — never hard-delete rows, so the agent's historical context and audit are preserved.

### Testing standards

- Unit tests for use cases assert filtering, validation, and soft-delete behavior.
- If integration tests run, use a non-superuser app role against local Supabase (superusers bypass RLS — same caveat as Story 4.1).

### Pitfalls to avoid

- Do NOT add a new migration — `knowledge_base` already exists from Story 6.1.
- Do NOT hard-delete — `DELETE /knowledge-base/:id` is a soft delete (`ativo = false`).
- Do NOT create a new `/ai/improve-text` route — reuse the one extended in Story 6.2; just ensure the `faq_answer` / `objection_counter` contexts are registered.
- Do NOT make `categoria` a DB enum — keep it free text; the selector values are a UI convention.
- Do NOT forget the exact toast copy "Contorno atualizado com sucesso." (AC #3).

### Project Structure Notes

- ALL knowledge use cases (CRUD + agent tool search) live in `@leedi/knowledge` (`packages/knowledge/`). The Hono routes in `apps/api` are thin wrappers. FAQ/Objections UI in `apps/dashboard`. Only `src/index.ts` is the public surface per package. Do NOT put use cases in `apps/api` or `packages/db`.

### References

- [Source: docs/01-leedi-arquitetura.md#6.6 Knowledge — knowledge_base]
- [Source: _bmad-output/planning-artifacts/epics.md#Story 6.3: FAQ & Objection-Counter Library]
- [Source: _bmad-output/implementation-artifacts/6-1-product-catalog-crud.md] (knowledge_base schema + migration)
- [Source: _bmad-output/implementation-artifacts/6-2-sales-arguments-differentials-social-proofs.md] (improve-text context extension)

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6 (1M context)

### Debug Log References

_none_

### Completion Notes List

Story 6.3: create/list/update/delete knowledge base entries, search-knowledge-base (consultar_base_conhecimento) V1 keyword match, FAQ + Objections management UI, toast: Contorno atualizado com sucesso., soft delete only.

Unit tests: at implementation time only `search-knowledge-base` was actually covered (the `create-knowledge-entry` and `delete-knowledge-entry` bullets in Task 5 were checked but the test files did NOT exist — the original "4 unit tests passing" claim was inaccurate). Code review 2026-06-10 **added** `create-knowledge-entry.test.ts` (AC#1: faq create + rejects empty pergunta/resposta + invalid tipo) and `delete-knowledge-entry.test.ts` (AC#6: asserts `set({ ativo: false })` soft-delete + false on no match). `@leedi/knowledge` now: 6 test files, 19 tests passing, tsc clean.

### File List

_see git diff_

### Change Log

- 2026-06-01: Implemented.
- 2026-06-10: Code review (Opus). Fixed typecheck error in `knowledge-base.ts` route: explicit `undefined` for `tipo`/`categoria` violated `exactOptionalPropertyTypes` — now spread conditionally. Also fixed the `update-product-arguments` test (shared with 6.2) which imported `ProductValidationError` from the wrong module, resolving to `undefined` so `rejects.toThrow(undefined)` passed vacuously — now imported from `create-product.js`, restoring real assertion. AC verification: objection toast copy "Contorno atualizado com sucesso." is exact; categoria selector values `preco|tempo|capacidade|outros` present; categoria filter works; soft-delete (`ativo=false`) only. `searchKnowledgeBase` (consultar_base_conhecimento) V1 keyword/ILIKE match confirmed; embedding stays deferred. Story 6.3 → done. See epic-6-code-review-report.md.
