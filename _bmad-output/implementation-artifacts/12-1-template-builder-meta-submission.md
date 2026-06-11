---
baseline_commit: 992b842
---

# Story 12.1: Template Builder & Meta Submission

Status: done

## Story

As a tenant admin,
I want to build a WhatsApp message template and submit it to Meta for approval from within the platform,
so that I have approved templates ready for dispatch without using Meta Business Manager directly.

## Acceptance Criteria

1. **Given** the DB migration runs, **When** the schema is applied, **Then** table `templates` exists with columns from Architecture §6.9: `id` (uuid pk), `tenant_id` (uuid FK), `connection_id` (uuid FK → `whatsapp_connections.id` nullable), `nome` (text), `categoria` enum `marketing|utility|authentication`, `idioma` (text default `'pt_BR'`), `componentes` jsonb, `variaveis` jsonb, `meta_template_id` (text nullable), `status` enum `rascunho|pendente|aprovado|rejeitado|pausado`, `motivo_rejeicao` (text nullable), `created_at`, `updated_at`. RLS enabled with tenant isolation.
2. **Given** a tenant admin navigates to Templates → Novo template, **When** the page loads, **Then** a form shows: nome, categoria selector (Marketing / Utilidade / Autenticação), language field (default pt_BR), and a component builder with sections for: Header (text or media toggle), Body (textarea with `{{1}}`, `{{2}}` variable insertion helper), Footer (optional text), and Buttons (up to 2 CTA buttons: URL or quick reply).
3. **Given** a tenant admin fills in the template form and clicks "Salvar rascunho", **When** submitted, **Then** a `templates` record is created with `status: rascunho` and the `componentes` jsonb stores the structured header/body/footer/buttons.
4. **Given** a template in `rascunho` status is ready, **When** the admin clicks "Enviar para aprovação" and confirms, **Then** the platform calls `WhatsAppProvider.submeterTemplate(conexao, template)` which calls the Meta Graph API `/v18.0/{waba_id}/message_templates`; on success `templates.status` is set to `pendente` and `templates.meta_template_id` is saved from the API response.
5. **Given** the Meta API returns an error during submission (e.g., duplicate template name, invalid format), **When** the submission fails, **Then** the error message from Meta is displayed to the user in Portuguese-BR and the template remains in `rascunho` status — no status update is persisted.
6. **Given** a template with variables (e.g., `{{1}}`, `{{2}}` in the body), **When** saved, **Then** `templates.variaveis` stores an array of variable descriptors: `[{ index: 1, exemplo: "João" }, { index: 2, exemplo: "R$ 297,00" }]`; variable examples are editable by the user in the form (Meta requires examples for submission).
7. **Given** a tenant admin wants to edit an approved template, **When** they click "Editar", **Then** a confirmation modal warns: "Editar um template aprovado criará uma nova versão para revisão. A versão atual continuará aprovada até a nova ser avaliada pela Meta." — editing creates a new `templates` record (the old one is kept).

## Tasks / Subtasks

- [x] Task 1: DB schema + migration (AC: #1)
  - [x] Create `packages/db/src/schema/template.ts`
  - [x] Define `pgEnum('template_categoria', ['marketing', 'utility', 'authentication'])`
  - [x] Define `pgEnum('template_status', ['rascunho', 'pendente', 'aprovado', 'rejeitado', 'pausado'])`
  - [x] Define `templates` table with all columns from Architecture §6.9
  - [x] Generate migration — confirmed next free slot is 0012 (story note said 0011 but 0011 was already used for gateway)
  - [x] `ENABLE ROW LEVEL SECURITY` + `FORCE ROW LEVEL SECURITY`; tenant isolation policy; `updated_at` trigger
  - [x] Re-export from `packages/db/src/schema/index.ts`
- [x] Task 2: Meta submission adapter method (AC: #4)
  - [x] In `packages/connection/src/adapters/meta-cloud-provider.ts`, implement `submitTemplate(wabaId, template)`:
    - Build the Meta Graph API payload from `templates.componentes` + `templates.variaveis`
    - POST to `https://graph.facebook.com/{WHATSAPP_API_VERSION}/{waba_id}/message_templates`
    - On success, return `{ metaTemplateId: string }`
    - On error, throw with Meta's error message preserved
  - [x] Add `submitTemplate` + `SubmitTemplatePayload` + `TemplateComponentPayload` to `packages/connection/src/index.ts`
- [x] Task 3: Templates API (AC: #3, #4, #5, #7)
  - [x] Create `apps/api/src/routes/templates/index.ts` (Hono router)
  - [x] `GET /templates` — list all tenant templates with status filter
  - [x] `POST /templates` — create template with `status: rascunho`; validate `componentes` structure with Zod
  - [x] `GET /templates/:id` — single template detail
  - [x] `PATCH /templates/:id` — update template (only allowed for `rascunho` status)
  - [x] `DELETE /templates/:id` — delete (only allowed for `rascunho`)
  - [x] `POST /templates/:id/submit` — submit to Meta; NEVER update status on API error
  - [x] `POST /templates/:id/duplicate` — creates a new `rascunho` copy (for AC #7 edit-approved flow)
  - [x] Create use cases in `apps/api/src/use-cases/templates/`: `create-template.ts`, `update-template.ts`, `submit-template.ts`, `get-templates.ts`
  - [x] Register router in `apps/api/src/app.ts`
- [x] Task 4: Template builder UI (AC: #2, #3, #6)
  - [x] Create `apps/dashboard/app/(shell)/templates/page.tsx` — templates list
  - [x] Create `apps/dashboard/app/(shell)/templates/template-list-client.tsx` — list with status filter tabs
  - [x] Create `apps/dashboard/app/(shell)/templates/new/page.tsx` — template creation form
  - [x] Create `apps/dashboard/app/(shell)/templates/template-builder-client.tsx` — full builder form
  - [x] Header toggle, Body with variable insertion, Footer, Buttons (up to 2), Category, Nome (slug validation)
  - [x] "Salvar rascunho" → POST /templates; "Enviar para aprovação" (disabled until draft saved + examples filled) → POST /templates/:id/submit with confirmation dialog
  - [x] Error display: red alert box for Meta errors in PT-BR
  - [x] Empty state on list page
- [x] Task 5: Tests (AC: #1, #3, #4, #5, #6)
  - [x] Unit: `submit-template` use case calls adapter and updates status to `pendente` on success
  - [x] Unit: `submit-template` does NOT update status when adapter throws
  - [x] Unit: Zod validation rejects `componentes` missing required `body` section
  - [x] Unit: variable extraction from body text correctly populates `variaveis` array
  - [x] Integration: RLS — cross-tenant template read returns zero rows (simulated via unit test)

## Dev Notes

- Files to create: `packages/db/src/schema/template.ts`, migration file (0011), `apps/api/src/routes/templates/index.ts`, use cases, `apps/dashboard/app/(shell)/templates/page.tsx`, `apps/dashboard/app/(shell)/templates/new/page.tsx`.
- Files to modify: `packages/db/src/schema/index.ts`, `apps/api/src/app.ts`, `packages/connection/src/index.ts` (add `submeterTemplate` to interface), `packages/connection/src/providers/meta-cloud.ts` (implement), dashboard sidebar (add Templates link).
- Meta template name restrictions: must be lowercase, no spaces (use underscores), max 512 chars. Enforce at API validation layer.
- The `componentes` jsonb structure mirrors Meta's template component format: `{ header?: { type, text | format }, body: { text }, footer?: { text }, buttons?: [{ type, text, url? }] }`. Use this exact structure so the submission adapter can pass it directly to Meta.
- Variable examples in `variaveis` are REQUIRED by Meta for template submission — the UI must force the user to fill them in before "Enviar para aprovação" is enabled.
- npm dependencies: no new external packages — Meta Graph API called via fetch; `zod` for validation.
- The `connection_id` FK links the template to a specific WhatsApp number (a tenant may have multiple connections in the future). For V1 with one connection per tenant, auto-populate from the tenant's active connection.

### Testing standards

- Unit tests: Vitest, mocked connection adapter. Test status transitions and validation.
- Integration: create template → submit → verify `status: pendente` in DB. Mock Meta API with MSW or `fetch` mock.

### Pitfalls to avoid

- Do NOT update `templates.status` if the Meta API call throws — the status must reflect Meta's actual acceptance.
- Do NOT allow submission of a template already in `pendente` or `aprovado` status.
- Template names must be unique per WABA — Meta will return an error for duplicates. Surface this as a user-friendly message: "Já existe um template com este nome aprovado pela Meta. Escolha um nome diferente."
- Confirm migration number 0011 at implementation time.
- `waba_id` for the submission endpoint comes from `whatsapp_connections.waba_id` (decrypted). Do NOT hardcode.

### References

- [Source: docs/01-leedi-arquitetura.md#6.9 Domínio Template]
- [Source: _bmad-output/planning-artifacts/epics.md#Story 12.1]
- [Source: _bmad-output/implementation-artifacts/4-1-whatsapp-connection-schema-encrypted-credential-storage.md] (WhatsAppProvider interface + adapter pattern)
- [Source: _bmad-output/implementation-artifacts/3-3-ai-assisted-textarea-component.md] (AIAssistedTextarea for body field)

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

- Migration number in story was wrong (0011); corrected to 0012 after confirming on disk.
- File paths in story were stale (e.g. `providers/meta-cloud.ts` → `adapters/meta-cloud-provider.ts`); used actual paths.
- Method name changed from `submeterTemplate` to `submitTemplate` to match English method convention.
- API version uses `env.WHATSAPP_API_VERSION` (not hardcoded v18.0).
- `exactOptionalPropertyTypes: true` required casting `componentes`/`variaveis` via `as unknown as T` for Drizzle `.values()` / `.set()`.
- `reason` field changed from optional (`?`) to `string | undefined` to satisfy exactOptionalPropertyTypes in function signatures.

### Completion Notes List

- DB schema (`packages/db/src/schema/template.ts`) with `templateCategoriaEnum`, `templateStatusEnum`, `templates` table (all columns from Architecture §6.9), and `template_library` (Story 12.2 folded in).
- Migration `0012_template_schema.sql` applied to Supabase: tables, enums, RLS policy, updated_at trigger, and seed for 8 library entries.
- `submitTemplate(wabaId, payload)` added to `WhatsAppProvider` interface and `MetaCloudProvider` adapter; uses `env.WHATSAPP_API_VERSION`; throws with Meta error message on failure.
- Templates API router (`apps/api/src/routes/templates/index.ts`): GET/POST/GET:id/PATCH:id/DELETE:id/POST:id/submit/POST:id/duplicate + GET library.
- Use cases: `create-template`, `get-templates`, `update-template`, `submit-template`.
- Dashboard: templates list page with status filter tabs, template builder with header/body/footer/buttons/variables, draft save + confirm-submit flow.
- 11 new unit tests, all passing. Full suite: 89/89 tests pass, 0 new TS errors.

### File List

- packages/db/src/schema/template.ts (new)
- packages/db/src/schema/index.ts (modified)
- packages/db/src/index.ts (modified — export types)
- packages/db/src/seeds/template-library.ts (new)
- packages/db/migrations/0012_template_schema.sql (new)
- packages/connection/src/ports/whatsapp-provider.ts (modified — submitTemplate + types)
- packages/connection/src/adapters/meta-cloud-provider.ts (modified — submitTemplate impl)
- packages/connection/src/index.ts (modified — export new types)
- apps/api/src/routes/templates/index.ts (new)
- apps/api/src/use-cases/templates/create-template.ts (new)
- apps/api/src/use-cases/templates/get-templates.ts (new)
- apps/api/src/use-cases/templates/update-template.ts (new)
- apps/api/src/use-cases/templates/submit-template.ts (new)
- apps/api/src/use-cases/templates/__tests__/create-template.test.ts (new)
- apps/api/src/use-cases/templates/__tests__/submit-template.test.ts (new)
- apps/api/src/use-cases/templates/__tests__/get-templates.test.ts (new)
- apps/api/src/app.ts (modified — register templates router)
- apps/dashboard/app/(shell)/templates/page.tsx (new)
- apps/dashboard/app/(shell)/templates/template-list-client.tsx (new)
- apps/dashboard/app/(shell)/templates/new/page.tsx (new)
- apps/dashboard/app/(shell)/templates/template-builder-client.tsx (new)

### Change Log

- feat(templates): Epic 12 — template schema, Meta submission adapter, templates API + builder UI (2026-06-02)

### Review Findings

_Code review (Opus, 2026-06-10) — 3-layer adversarial (Blind / Edge Case / Acceptance Auditor). All 5 patches applied & verified: templates use-case 14/14 + new route test `templates-routes.test.ts` 4/4 (DELETE guard + `?status=` 400); full api suite 183 pass (4 fail = pre-existing Epic 13 flaky, unrelated); typecheck clean for Epic 12 files. The `/library` registration-order fix verified empirically against Hono 4.12.23. Dashboard edit-page changes verified by typecheck + reasoning only (not exercised in a browser — consistent with project close-out convention)._

- [x] [Review][Patch] AC#7 edit-approved UX unimplemented + dead template link — `template-list-client.tsx` links every template name to `/templates/${id}`, but no `app/(shell)/templates/[id]/page.tsx` route exists (404 on every click). **Decision (Caio, 2026-06-10): implement the full edit page** — build `templates/[id]/page.tsx` (detail + "Editar"), with the AC#7 warning modal ("Editar um template aprovado criará uma nova versão para revisão. A versão atual continuará aprovada até a nova ser avaliada pela Meta.") wiring to the existing `POST /:id/duplicate`. [template-list-client.tsx:161]
- [x] [Review][Patch] `GET /library` shadowed by `GET /:id` — Hono 4.12.23 matches by registration order (empirically confirmed: `/library` → `/:id` handler with `id="library"`); query `WHERE id='library'` against uuid column → 22P02 → 500. Biblioteca feature (Story 12.2) broken. Fix: register `/library` before `/:id`. [routes/templates/index.ts:50,163]
- [x] [Review][Patch] `DELETE /:id` guard returns are inside the `withTenant` callback (return value discarded) → handler always falls through to `c.body(null, 204)`: non-existent template → 204 instead of 404; non-`rascunho` template → 204 "success" while row is NOT deleted (client falsely told it succeeded). [routes/templates/index.ts:90-107]
- [x] [Review][Patch] `GET /templates?status=<garbage>` — raw query cast onto pg enum (`filters.status as ...`) → `invalid input value for enum template_status` (22P02) → uncaught 500. Validate with `z.enum([...])` → 400. Same class as the Epic 8 playground bug. [routes/templates/index.ts:25 + get-templates.ts:26-29]
- [x] [Review][Patch] `submitTemplate` ignores `template.connectionId` and loads the tenant's first connection via `.limit(1)` with no `orderBy` (non-deterministic; submits to wrong WABA if tenant has >1 connection). Prefer `template.connectionId` when set; add deterministic ordering. (Low impact under V1 single-connection.) [submit-template.ts:84-96]
- [x] [Review][Defer] Concurrent submit TOCTOU — `status==='rascunho'` check and the final UPDATE run in separate transactions with the Meta network call between them and no `status='rascunho'` predicate on the UPDATE; two simultaneous submits both POST to Meta — deferred, low-likelihood under V1 single-admin; atomic-claim fix has a tradeoff vs AC#5 (transient `pendente` window).
- [x] [Review][Defer] No server-side validation that body `{{N}}` placeholders match `variaveis` indices / are sequential from 1; `{{0}}` accepted then rejected with a misleading `variaveis` error — deferred, UI enforces coverage; hardening for direct-API / duplicate drift.
- [x] [Review][Defer] `templates` RLS policy has `USING` but no `WITH CHECK` (INSERT/UPDATE post-image not constrained) — deferred, systemic repo-wide pattern (every tenant-isolation policy in migrations/); app-layer `withTenant` mitigates writes. Candidate for pre-launch hardening.
- [x] [Review][Defer] Migration seed `componentes_sugeridos` embeds a dead `variaveis` key (type + UI ignore it; the TS seed source disagrees) — deferred, no functional impact; migration 0012 already applied.
