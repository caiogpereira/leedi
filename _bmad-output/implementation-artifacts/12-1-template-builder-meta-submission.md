---
baseline_commit: 9ea8a05
---

# Story 12.1: Template Builder & Meta Submission

Status: ready-for-dev

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

- [ ] Task 1: DB schema + migration (AC: #1)
  - [ ] Create `packages/db/src/schema/template.ts`
  - [ ] Define `pgEnum('template_categoria', ['marketing', 'utility', 'authentication'])`
  - [ ] Define `pgEnum('template_status', ['rascunho', 'pendente', 'aprovado', 'rejeitado', 'pausado'])`
  - [ ] Define `templates` table with all columns from Architecture §6.9
  - [ ] Generate migration — confirm next free slot is 0011 (after 0010=gateway from Story 11.1)
  - [ ] `ENABLE ROW LEVEL SECURITY` + `FORCE ROW LEVEL SECURITY`; tenant isolation policy; `updated_at` trigger
  - [ ] Re-export from `packages/db/src/schema/index.ts`
- [ ] Task 2: Meta submission adapter method (AC: #4)
  - [ ] In `packages/connection/src/providers/meta-cloud.ts`, implement `submeterTemplate(conexao, template)`:
    - Build the Meta Graph API payload from `templates.componentes` + `templates.variaveis`
    - POST to `https://graph.facebook.com/v18.0/{waba_id}/message_templates`
    - On success, return `{ meta_template_id: string }`
    - On error, throw with Meta's error message preserved
  - [ ] Add `submeterTemplate` to the `WhatsAppProvider` interface in `packages/connection/src/index.ts`
- [ ] Task 3: Templates API (AC: #3, #4, #5, #7)
  - [ ] Create `apps/api/src/routes/templates/index.ts` (Hono router)
  - [ ] `GET /templates` — list all tenant templates with pagination and status filter
  - [ ] `POST /templates` — create template with `status: rascunho`; validate `componentes` structure with Zod
  - [ ] `GET /templates/:id` — single template detail
  - [ ] `PATCH /templates/:id` — update template (only allowed for `rascunho` status; for `aprovado`, see AC #7)
  - [ ] `DELETE /templates/:id` — delete (only allowed for `rascunho`)
  - [ ] `POST /templates/:id/submit` — submit to Meta: validate status is `rascunho`, call adapter, update status to `pendente` on success; NEVER update status on API error
  - [ ] `POST /templates/:id/duplicate` — creates a new `rascunho` copy (for AC #7 edit-approved flow)
  - [ ] Create use cases in `apps/api/src/use-cases/templates/`: `create-template.ts`, `update-template.ts`, `submit-template.ts`
  - [ ] Register router in `apps/api/src/app.ts` behind RBAC `admin` guard
- [ ] Task 4: Template builder UI (AC: #2, #3, #6)
  - [ ] Create `apps/dashboard/app/(shell)/templates/page.tsx` — templates list
  - [ ] Create `apps/dashboard/app/(shell)/templates/new/page.tsx` — template creation form
  - [ ] Form sections:
    - **Header**: toggle (Nenhum / Texto / Mídia); text input or media type selector
    - **Body**: `<AIAssistedTextarea>` with variable insertion button `{{1}}`, `{{2}}`; below the textarea, editable example values for each variable detected
    - **Footer**: optional text input
    - **Buttons**: up to 2 buttons; each with type toggle (URL / Resposta rápida) + label + URL (for URL type)
    - **Category** select: Marketing / Utilidade / Autenticação
    - **Nome**: text input (slugified for Meta — no spaces)
  - [ ] "Salvar rascunho" button → POST /templates
  - [ ] "Enviar para aprovação" button (only enabled if status is `rascunho`) → POST /templates/:id/submit
  - [ ] Error display: show Meta error message in a red alert box in Portuguese-BR
  - [ ] Empty state: "Nenhum template criado. Crie seu primeiro template para disparos."
- [ ] Task 5: Tests (AC: #1, #3, #4, #5, #6)
  - [ ] Unit: `submit-template` use case calls adapter and updates status to `pendente` on success
  - [ ] Unit: `submit-template` does NOT update status when adapter throws
  - [ ] Unit: Zod validation rejects `componentes` missing required `body` section
  - [ ] Unit: variable extraction from body text correctly populates `variaveis` array
  - [ ] Integration: RLS — cross-tenant template read returns zero rows

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

_not yet assigned_

### Debug Log References

_none_

### Completion Notes List

_not yet implemented_

### File List

_not yet implemented_

### Change Log

_none_
