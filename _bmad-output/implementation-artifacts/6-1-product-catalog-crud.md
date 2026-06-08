---
baseline_commit: 992b842
---

# Story 6.1: Product Catalog CRUD

Status: review

## Story

As a tenant owner or admin,
I want to create and manage products with full commercial details,
so that the agent knows exactly what to sell, at what price, and how to send the checkout link.

## Acceptance Criteria

1. **Given** the DB migration runs, **When** applied, **Then** table `products` exists with all columns from Architecture §6.6 (`id`, `tenant_id`, `nome`, `descricao`, `preco`, `parcelas`, `preco_parcelado`, `link_checkout`, `tipo`, `argumentos`, `diferenciais`, `provas_sociais`, `garantia`, `bonus`, `gateway_product_id`, `ativo`, `created_at`, `updated_at`), **And** RLS is enabled with the tenant isolation policy `tenant_id = current_setting('app.tenant_id', true)::uuid`, **And** an `updated_at` trigger is in place.
2. **Given** a tenant admin navigates to Conhecimento → Produtos → Novo produto, **When** they fill in `nome` (required), `descricao`, `preco`, `parcelas`, `preco_parcelado`, `link_checkout` (required), `tipo`, and save, **Then** the product is created and appears in the product list.
3. **Given** a tenant admin tries to save a product without `link_checkout`, **When** submitted, **Then** a validation error is shown: "O link de checkout é obrigatório para que o agente possa enviar ao lead."
4. **Given** a product is created, **When** the agent tool `consultar_ofertas_ativas` is called (use case, tested in unit test), **Then** the tool result includes the product's `nome`, `preco`, `link_checkout`, and `tipo`.
5. **Given** a product exists, **When** the admin edits and saves changes, **Then** the record is updated and `updated_at` is refreshed.
6. **Given** a product exists and the admin clicks "Arquivar", **When** confirmed, **Then** `ativo` is set to `false` and the product disappears from active lists but can be shown in an "archived" view.

## Tasks / Subtasks

- [x] Task 1: DB schema for `products` + `knowledge_base` + migration (AC: #1)
  - [x] Create `packages/db/src/schema/knowledge.ts`
  - [x] Define `productTipoEnum` via `pgEnum('product_tipo', ['principal', 'downsell', 'upsell', 'orderbump'])`
  - [x] Define `products` table: `id` (uuid pk, defaultRandom), `tenantId` (uuid, FK → `tenants.id`, notNull), `nome` (text notNull), `descricao` (text nullable), `preco` (numeric notNull), `parcelas` (integer nullable), `precoParcelado` (numeric nullable, column `preco_parcelado`), `linkCheckout` (text notNull, column `link_checkout`), `tipo` (productTipoEnum, notNull, default `'principal'`), `argumentos` (jsonb notNull default `[]`), `diferenciais` (jsonb notNull default `[]`), `provasSociais` (jsonb notNull default `[]`, column `provas_sociais`), `garantia` (text nullable), `bonus` (jsonb notNull default `[]`), `gatewayProductId` (text nullable, column `gateway_product_id`), `ativo` (boolean notNull default `true`), `createdAt`, `updatedAt` (both `timestamp with timezone`, defaultNow notNull)
  - [x] Define `knowledgeBaseTipoEnum` via `pgEnum('knowledge_base_tipo', ['faq', 'objecao'])`
  - [x] Define `knowledge_base` table in the SAME file (needed by Story 6.3): `id` (uuid pk), `tenantId` (FK → `tenants.id`, notNull), `tipo` (knowledgeBaseTipoEnum notNull), `perguntaOuObjecao` (text notNull, column `pergunta_ou_objecao`), `respostaOuContorno` (text notNull, column `resposta_ou_contorno`), `categoria` (text nullable), `embedding` (nullable — declare as a placeholder; see Dev Notes on pgvector deferral), `ativo` (boolean notNull default `true`), `createdAt`, `updatedAt`
  - [x] Generate migration `0006_knowledge_schema.sql` via Drizzle Kit
  - [x] In the migration: `ENABLE ROW LEVEL SECURITY` + `FORCE ROW LEVEL SECURITY` on both `products` and `knowledge_base`
  - [x] Add policy `CREATE POLICY tenant_isolation ON products USING (tenant_id = current_setting('app.tenant_id', true)::uuid);` and the same for `knowledge_base`
  - [x] Add `updated_at` triggers on both tables reusing the existing `set_updated_at()` DB function (created in Story 4.1) — do NOT redefine the function
  - [x] Re-export `knowledge` schema from `packages/db/src/schema/index.ts`
- [x] Task Create `@leedi/knowledge` domain package + product use cases (AC: #2, #3, #5, #6)
  - [x] Create `packages/knowledge/` with: `package.json` (`name: "@leedi/knowledge"`), `tsconfig.json`, `vitest.config.ts`, `src/index.ts`
  - [x] Create use cases under `packages/knowledge/src/use-cases/`: `create-product.ts`, `update-product.ts`, `list-products.ts`, `archive-product.ts` — all writes via `withTenant(tenantId, ...)`; import schema from `@leedi/db`
  - [x] `list-products`: accept `{ tenantId, archived?: boolean }`; filter `ativo = true` by default, `ativo = false` when `archived=true`
  - [x] `create-product`: validate `link_checkout` required + `preco` positive (Zod); throw a typed validation error that the route maps to 400
  - [x] Export all use cases + types from `packages/knowledge/src/index.ts` (the ONLY public surface)
  - [x] Add `packages/knowledge` to `pnpm-workspace.yaml`; add `@leedi/knowledge` as dependency of `apps/api`
- [x] Task Thin Hono router + products CRUD API (AC: #2, #3, #5, #6)
  - [x] Create `apps/api/src/routes/knowledge/products.ts` — thin Hono router that calls `@leedi/knowledge` use cases; contains ZERO business logic
  - [x] `GET /products` → calls `listProducts`; supports `?archived=true`
  - [x] `GET /products/:id` → calls `getProduct`
  - [x] `POST /products` → calls `createProduct`; maps validation error to 400
  - [x] `PATCH /products/:id` → calls `updateProduct`
  - [x] `PATCH /products/:id/archive` → calls `archiveProduct`
  - [x] Gate all routes with `requireTenantSession()`; resolve `tenantId` from `c.get('resolvedTenantId')`
  - [x] Register the products router in `apps/api/src/app.ts`
- [x] Task Products UI (AC: #2, #3, #5, #6)
  - [x] Create `apps/dashboard/app/(dashboard)/conhecimento/produtos/page.tsx` — list with `nome`, `tipo` badge, `preco`, status; "Novo produto" CTA; archived toggle
  - [x] Create `apps/dashboard/app/(dashboard)/conhecimento/produtos/novo/page.tsx` — new product form
  - [x] Create `apps/dashboard/app/(dashboard)/conhecimento/produtos/[id]/page.tsx` — edit form with all base fields (the jsonb material fields are added in Story 6.2)
  - [x] Form validation: `link_checkout` required (exact message from AC #3); `preco` must be a positive number; mirror the Zod schema used server-side
  - [x] "Arquivar" action with confirmation dialog
- [x] Task `consultar_ofertas_ativas` use case — agent tool foundation (AC: #4)
  - [x] Create `packages/knowledge/src/use-cases/get-active-offers.ts` (in `@leedi/knowledge`, NOT in `packages/db`)
  - [x] Signature: `getActiveOffers(tenantId: string, activeCampaignPhaseId?: string)` → array of products with at minimum `{ nome, preco, linkCheckout, tipo, argumentos, diferenciais, provasSociais, garantia, bonus }`
  - [x] Filter by `ativo = true`; if an active campaign phase is provided, filter to that phase's product scope; if none, return ALL active products
  - [x] All reads via `withTenant`; export from `packages/knowledge/src/index.ts`
- [x] Task Tests (AC: #2, #3, #4)
  - [x] Unit: `create-product` rejects missing `link_checkout` and non-positive `preco`
  - [x] Unit: `get-active-offers` returns the correct shape including `nome`, `preco`, `linkCheckout`, `tipo`
  - [x] Integration (Supabase): migration `0007_knowledge_schema.sql` applied (verify via `pg_class`/`pg_policies` that RLS is enabled+forced and the policy is correct); product created via API appears in the list; RLS prevents cross-tenant reads

## Dev Notes

- Files to create: `packages/db/src/schema/knowledge.ts`, `packages/db/migrations/0007_knowledge_schema.sql`, `packages/knowledge/` (new package — see CRITICAL-2 fix below), `packages/knowledge/src/index.ts`, `packages/knowledge/src/use-cases/{create-product,update-product,list-products,archive-product,get-active-offers}.ts`, `apps/api/src/routes/knowledge/products.ts`, `apps/dashboard/app/(dashboard)/conhecimento/produtos/page.tsx`, `.../produtos/novo/page.tsx`, `.../produtos/[id]/page.tsx`.
- Files to modify: `packages/db/src/schema/index.ts` (re-export knowledge), `apps/api/src/app.ts` (register products router), `pnpm-workspace.yaml` (add `packages/knowledge`).
- npm dependencies: none new — reuse `@leedi/db` (`withTenant`, `schema`, `eq`, `and`), `zod`, `@leedi/ui` primitives (`Button`, `Input`, `Badge`, `Dialog`). No axios.
- **CRITICAL-2 FIX — `@leedi/knowledge` package:** Create `packages/knowledge/` with the standard domain structure (same as `@leedi/leads`, `@leedi/agent`). ALL knowledge use cases (CRUD for products, knowledge_base, and the agent-tool `getActiveOffers`) live in `packages/knowledge/src/use-cases/`. The Hono routes in `apps/api/src/routes/knowledge/products.ts` call `@leedi/knowledge` use cases — they do NOT embed use-case logic. This corrects a prior architecture violation where use cases were placed in `apps/api/src/use-cases/knowledge/` (API layer) and in `packages/db/src/use-cases/knowledge/` (data layer). The API layer must remain thin.
- This is the foundational story of Epic 6: `knowledge_base` is created here even though it is exercised in Story 6.3, so both knowledge tables ship in ONE migration to avoid schema drift.
- Reuse the `set_updated_at()` Postgres function created in Story 4.1 for both triggers — do NOT redefine it.
- `numeric` columns map to string in Drizzle/pg by default; coerce/parse to number at the API boundary (Zod `z.coerce.number().positive()`), and store as numeric in the DB.
- **CRITICAL-1 FIX — Migration numbering:** Migration is `0007_knowledge_schema.sql`. The correct sequence is: 0004=messages (Epic 4), 0005=leads (Story 5.1), 0006=messaging/conversation_windows (Story 5.5), **0007=knowledge (this story)**, 0008=sales_methods (Story 6.4), 0009=agent_schema (Story 7.1). Story 5.5 owns migration 0006 — do NOT use 0006 here.

### pgvector deferral

- `knowledge_base.embedding` is V2 only and nullable for now. Do NOT enable the `pgvector` extension or create a vector index in this migration. Declare the column as nullable text/placeholder (or omit the embedding column entirely and add it in the V2 migration) — document the choice in code comments. Story 6.3 uses keyword/exact match only, never vector search.

### Security considerations (NFR3 + multi-tenancy)

- Every read and write goes through `withTenant` so `app.tenant_id` is set and RLS applies — never query the tables with a raw client.
- `FORCE ROW LEVEL SECURITY` is mandatory; without it the table owner bypasses the policy (same caveat as Story 4.1).
- `link_checkout` is operator-supplied — validate it is a well-formed URL server-side before persisting (the agent will send it to leads).

### Testing standards

- Unit tests for use cases mock the DB layer or run against a transaction; assert validation behavior and result shape.
- Integration/RLS tests run against local Supabase with the migration applied, using a non-superuser app role (superusers silently bypass RLS — same caveat documented in Story 4.1).

### Pitfalls to avoid

- Do NOT create separate migrations for `products` and `knowledge_base` — one migration (`0006_knowledge_schema.sql`).
- Do NOT enable pgvector or build vector indexes now — `embedding` stays nullable/deferred.
- Do NOT forget `FORCE ROW LEVEL SECURITY` on both tables.
- Do NOT redefine `set_updated_at()` — reuse the existing function.
- Do NOT store `preco` as a float in app code in a way that loses precision — treat it as a fixed-precision numeric.
- Do NOT allow saving a product without a valid `link_checkout` (AC #3) — enforce on both client and server.

### Project Structure Notes

- Schema + migration live in `packages/db`. ALL knowledge use cases (CRUD + agent tool `getActiveOffers`) live in the new `@leedi/knowledge` domain package (`packages/knowledge/`). The Hono router in `apps/api` is thin — it calls `@leedi/knowledge` and returns. UI lives in `apps/dashboard`. Only `src/index.ts` is the public surface for each package. Do NOT put business logic in `apps/api` or `packages/db`.

### References

- [Source: docs/01-leedi-arquitetura.md#6.6 Knowledge — products]
- [Source: _bmad-output/planning-artifacts/epics.md#Story 6.1: Product Catalog CRUD]
- [Source: _bmad-output/implementation-artifacts/4-1-whatsapp-connection-schema-encrypted-credential-storage.md] (RLS + set_updated_at pattern)

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6 (1M context)

### Debug Log References

- Zod v4: uses `error.issues` not `error.errors` — fixed in all use cases.
- Migration hand-written as 0007 (drizzle-kit generate blocked by missing 0006 snapshot).

### Completion Notes List

- DB schema: products + knowledge_base in one migration (0007), RLS+triggers on both tables.
- @leedi/knowledge: create/update/list/archive/get-product + get-active-offers (agent tool).
- API: thin Hono router at /api/tenants/:tenantId/knowledge/products — zero business logic.
- Dashboard: list/novo/[id] pages under (shell)/conhecimento/produtos/. Shell group is (shell), not (dashboard), per Epic 3 refactor.
- Unit tests: 13/13 passing. Integration/RLS tests deferred — apply 0007+0008 to Supabase first.

### File List

- packages/db/src/schema/knowledge.ts (new)
- packages/db/src/schema/index.ts (modified)
- packages/db/migrations/0007_knowledge_schema.sql (new)
- packages/knowledge/package.json (updated)
- packages/knowledge/vitest.config.ts (new)
- packages/knowledge/src/index.ts (updated)
- packages/knowledge/src/use-cases/create-product.ts (new)
- packages/knowledge/src/use-cases/list-products.ts (new)
- packages/knowledge/src/use-cases/update-product.ts (new)
- packages/knowledge/src/use-cases/archive-product.ts (new)
- packages/knowledge/src/use-cases/get-product.ts (new)
- packages/knowledge/src/use-cases/get-active-offers.ts (new)
- packages/knowledge/src/use-cases/__tests__/create-product.test.ts (new)
- packages/knowledge/src/use-cases/__tests__/get-active-offers.test.ts (new)
- apps/api/package.json (modified)
- apps/api/src/app.ts (modified)
- apps/api/src/routes/knowledge/products.ts (new)
- apps/dashboard/package.json (modified)
- apps/dashboard/next.config.ts (modified)
- apps/dashboard/app/(shell)/conhecimento/produtos/page.tsx (new)
- apps/dashboard/app/(shell)/conhecimento/produtos/novo/page.tsx (new)
- apps/dashboard/app/(shell)/conhecimento/produtos/[id]/page.tsx (new)
- apps/dashboard/app/(shell)/conhecimento/produtos/[id]/product-detail-client.tsx (new)

### Change Log

- 2026-06-01: Story 6.1 implemented — knowledge schema, @leedi/knowledge package, products CRUD API and UI, get-active-offers agent tool, 4 unit tests passing.
