---
baseline_commit: 9ea8a05
---

# Story 10.1: Campaign CRUD & Phase Schema

Status: ready-for-dev

## Story

As a tenant admin,
I want to create and manage campaigns with phase configuration,
so that I can organize my product launches and control what the agent offers at each stage.

## Acceptance Criteria

1. **Given** the DB migration runs, **When** the schema is applied, **Then** tables `campaigns` and `segments` exist with all columns from Architecture §6.8: `campaigns` has (`id`, `tenant_id`, `nome`, `produto_id` FK → `products.id`, `tipo` enum `lancamento|downsell|perpetuo`, `fase` enum `aquecimento|carrinho_aberto|downsell|encerrada`, `data_inicio`, `data_fim`, `status` enum `rascunho|ativa|pausada|encerrada`, `config` jsonb, `created_at`, `updated_at`); `segments` has (`id`, `tenant_id`, `nome`, `filtros` jsonb, `created_at`, `updated_at`). RLS enabled on both with tenant isolation policy.
2. **Given** a tenant admin creates a campaign with name, product, type, and dates, **When** `POST /campaigns` is called with `status` omitted, **Then** the campaign is created with `fase: aquecimento` and `status: rascunho`.
3. **Given** a tenant admin navigates to Campanhas, **When** the page loads, **Then** a list of all tenant campaigns is shown with: name, tipo badge, status badge, current phase, product name, and date range.
4. **Given** a tenant admin opens a campaign, **When** the detail view renders, **Then** they can configure the `config` jsonb for each phase: urgency messaging (string), key messages (string[]), and transition condition (date or manual).
5. **Given** a campaign's `config` field is updated via the phase configuration UI, **When** `PATCH /campaigns/:id` is called, **Then** the `config` jsonb is saved and validated against a Zod schema: `{ aquecimento?: PhaseConfig; carrinho_aberto?: PhaseConfig; downsell?: DownsellPhaseConfig }` where:
   - `PhaseConfig = { urgencia?: string; mensagens_chave?: string[]; transicao?: { tipo: 'manual' | 'data'; data?: string } }`
   - `DownsellPhaseConfig = PhaseConfig & { produto_id?: string }` — `produto_id` (UUID) quando presente substitui `campaigns.produto_id` como oferta do agente durante a fase downsell.
6. **Given** a tenant tries to create two campaigns with `status: ativa` simultaneously, **When** the second activation is attempted, **Then** it is rejected with: "Já existe uma campanha ativa. Pause ou encerre a campanha atual antes de ativar outra." (Enforcement is at the API layer — a DB partial unique index on `(tenant_id) WHERE status = 'ativa'` is the recommended approach.)

## Tasks / Subtasks

- [ ] Task 1: DB schema + migration (AC: #1, #6)
  - [ ] Create `packages/db/src/schema/campaign.ts`
  - [ ] Define `pgEnum('campaign_tipo', ['lancamento', 'downsell', 'perpetuo'])`
  - [ ] Define `pgEnum('campaign_fase', ['aquecimento', 'carrinho_aberto', 'downsell', 'encerrada'])`
  - [ ] Define `pgEnum('campaign_status', ['rascunho', 'ativa', 'pausada', 'encerrada'])`
  - [ ] Define `campaigns` table: `id` (uuid pk, defaultRandom), `tenantId` (uuid FK → `tenants.id`, notNull, column `tenant_id`), `nome` (text notNull), `produtoId` (uuid FK → `products.id`, nullable, column `produto_id` — nullable because product may not be set at creation), `tipo` (campaignTipoEnum notNull), `fase` (campaignFaseEnum notNull default `'aquecimento'`), `dataInicio` (timestamptz nullable, column `data_inicio`), `dataFim` (timestamptz nullable, column `data_fim`), `status` (campaignStatusEnum notNull default `'rascunho'`), `config` (jsonb notNull default `{}`), `createdAt`, `updatedAt`
  - [ ] Define `segments` table: `id` (uuid pk), `tenantId` (uuid FK → `tenants.id`, notNull), `nome` (text notNull), `filtros` (jsonb notNull default `{}`), `createdAt`, `updatedAt`
  - [ ] Generate migration via Drizzle Kit. Confirm next free index in `_journal.json` at implementation time; if 0009 is taken, use the next free number and update Dev Notes. The planned sequence is: 0005=leads, 0006=messaging, 0007=knowledge, 0008=agent, 0009=campaign — verify before committing.
  - [ ] In migration SQL: `ENABLE ROW LEVEL SECURITY` + `FORCE ROW LEVEL SECURITY` on both tables; add tenant isolation policy (`tenant_id = current_setting('app.tenant_id', true)::uuid`); add partial unique index on `campaigns (tenant_id) WHERE status = 'ativa'` to enforce single active campaign per tenant
  - [ ] Add `updated_at` trigger on both tables reusing existing `set_updated_at()` function (from Story 4.1)
  - [ ] Re-export `campaign` schema from `packages/db/src/schema/index.ts`
- [ ] Task 2: Campaign API (AC: #2, #4, #5, #6)
  - [ ] Create `apps/api/src/routes/campaigns/index.ts` (Hono router)
  - [ ] `GET /campaigns` — list all tenant campaigns; optionally filter by `?status=ativa`
  - [ ] `POST /campaigns` — create campaign; default `fase: 'aquecimento'`, `status: 'rascunho'`; validate with Zod
  - [ ] `GET /campaigns/:id` — return single campaign with product name (join or separate fetch)
  - [ ] `PATCH /campaigns/:id` — update fields; validate `config` against Zod PhaseConfig schema (reject invalid shape)
  - [ ] `DELETE /campaigns/:id` — soft delete OR only allow for `status: 'rascunho'` (hard delete acceptable for V1)
  - [ ] Single-active-campaign guard in `activate-campaign` use case (Story 10.2 — wire the guard here as a shared use case function `assertNoActiveCampaign(tenantId)`)
  - [ ] Create use cases in `apps/api/src/use-cases/campaigns/`: `create-campaign.ts`, `update-campaign.ts`, `get-campaigns.ts`, `get-campaign.ts`
  - [ ] Register router in `apps/api/src/app.ts` behind `admin` RBAC guard
- [ ] Task 3: Campaign list & create UI (AC: #3)
  - [ ] Create `apps/dashboard/app/(shell)/campanhas/page.tsx` — campaign list page
  - [ ] Table/card list: campaign name, tipo badge (Lançamento / Downsell / Perpétuo), status badge (color-coded: rascunho=gray, ativa=green, pausada=yellow, encerrada=red), current phase, product name, date range
  - [ ] "Nova campanha" button opens a `<Dialog>` or navigates to a create form: fields for nome, tipo, produto (select from tenant products), data_inicio, data_fim (optional)
  - [ ] On submit: POST /campaigns → redirect to campaign detail page
  - [ ] Empty state: "Nenhuma campanha criada ainda. Crie sua primeira campanha de lançamento."
- [ ] Task 4: Campaign detail & phase config UI (AC: #4, #5)
  - [ ] Create `apps/dashboard/app/(shell)/campanhas/[id]/page.tsx` — campaign detail
  - [ ] Header: campaign name, status badge, current phase badge, activate/pause button (wired in Story 10.2)
  - [ ] Phase configuration tabs or accordion: one section per phase (Aquecimento / Carrinho Aberto / Downsell)
  - [ ] Each phase section: `urgencia` (Input), `mensagens_chave` (tags input or textarea, comma-separated), `transicao.tipo` toggle (manual / data) + date picker if `data`
  - [ ] Save button per phase (PATCH /campaigns/:id with updated `config`)
  - [ ] Toast on save success; inline validation on invalid config shape
- [ ] Task 5: Tests (AC: #1, #2, #5, #6)
  - [ ] Unit: `create-campaign` use case defaults `fase: 'aquecimento'` and `status: 'rascunho'`
  - [ ] Unit: `update-campaign` validates `config` with Zod and rejects invalid PhaseConfig shape
  - [ ] Integration: partial unique index on `(tenant_id) WHERE status = 'ativa'` rejects second activation attempt at DB level; API-level guard also tested
  - [ ] Integration: RLS — cross-tenant read returns zero rows

## Dev Notes

- Files to create: `packages/db/src/schema/campaign.ts`, migration file (next free number), `apps/api/src/routes/campaigns/index.ts`, `apps/api/src/use-cases/campaigns/{create,update,get,get-list}.ts`, `apps/dashboard/app/(shell)/campanhas/page.tsx`, `apps/dashboard/app/(shell)/campanhas/[id]/page.tsx`.
- Files to modify: `packages/db/src/schema/index.ts` (re-export), `apps/api/src/app.ts` (register router), dashboard sidebar navigation (add Campanhas link).
- `campaigns.produto_id` is a FK to the `products` table from Epic 6. If `products` table does not exist yet (migration 0007), the FK must be deferred or added in a later migration. Recommended: declare the column nullable and add the FK constraint only after confirming the products table exists at implementation time.
- The `config` jsonb schema is intentionally permissive at the DB level (any JSON) — Zod validation at the API layer is the enforcement point. Do NOT add a Postgres CHECK constraint on `config`.
- npm dependencies: none new — reuse `@leedi/db`, `zod`, `@leedi/ui` (Select, Input, Dialog, Badge, Tabs, Accordion).
- Do NOT redefine `set_updated_at()`.

### Testing standards

- Unit tests: Vitest, mocked DB layer. Assert business logic in use cases.
- Integration: local Supabase with migration applied; non-superuser role to verify RLS.

### Pitfalls to avoid

- Do NOT hard-code the migration number — check `_journal.json` at implementation time.
- The partial unique index `WHERE status = 'ativa'` is a Postgres expression index. Drizzle Kit may not emit it correctly — verify the generated SQL and hand-edit if needed.
- Do NOT forget `FORCE ROW LEVEL SECURITY` on both tables.
- `campaigns.produto_id` FK dependency: if products table does not exist, add the FK in a separate migration step — do not fail the migration.
- Do NOT reuse `Campaign` as a type name that conflicts with any existing Drizzle schema export.

### Project Structure Notes

- Schema + migration: `packages/db`. Use cases + Hono routes: `apps/api`. UI: `apps/dashboard`. No new packages.

### References

- [Source: docs/01-leedi-arquitetura.md#6.8 Domínio Campaign]
- [Source: _bmad-output/planning-artifacts/epics.md#Story 10.1]
- [Source: _bmad-output/implementation-artifacts/6-1-product-catalog-crud.md] (products table FK target)
- [Source: _bmad-output/implementation-artifacts/4-1-whatsapp-connection-schema-encrypted-credential-storage.md] (RLS + set_updated_at pattern)

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
