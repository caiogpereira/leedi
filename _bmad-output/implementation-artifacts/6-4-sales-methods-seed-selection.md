---
baseline_commit: 9ea8a05
---

# Story 6.4: Sales Methods Seed & Selection

Status: ready-for-dev

## Story

As a tenant owner or admin,
I want to choose a sales methodology (SPIN, AIDA, Storytelling, Free) for my agent,
so that the agent follows a structured approach to qualify and convert leads.

## Acceptance Criteria

1. **Given** the DB migration runs and the seed is applied, **When** `sales_methods` is queried, **Then** 4 records exist: SPIN, AIDA, Storytelling, Livre — all with `is_global: true`, a non-empty `system_prompt_template`, and a non-empty `phases` jsonb array.
2. **Given** a tenant admin navigates to Agente → Método de venda, **When** the page loads, **Then** a selector shows the 4 global sales methods with their `titulo` and `descricao`.
3. **Given** a tenant admin selects "SPIN Selling" and saves, **When** the selection is saved, **Then** the chosen method's ID is persisted (see the Story 7.1 dependency note — for now stored as a tenant preference, not yet on `agent_configs`).
4. **Given** a user reads the SPIN method's `system_prompt_template`, **When** it is applied in the agent, **Then** it guides qualification through Situação → Problema → Implicação → Necessidade questions.
5. **Given** a user reads the AIDA method's `system_prompt_template`, **When** applied, **Then** it structures conversation through Atenção → Interesse → Desejo → Ação phases.

## Story 7.1 Dependency (read before implementing)

The `agent_configs` table is created in Epic 7 Story 7.1. This story (6.4) creates ONLY the `sales_methods` schema + seed and the sales-method selector UI. Persisting the selected method to `agent_configs.sales_method_id` is wired in Story 7.1.

For now, the save action persists the selected `sales_method_id` to a `tenant_sales_method_preference` key inside the `tenants.config` jsonb field (a `PATCH /tenants/:id/config` or equivalent existing tenant-config endpoint). Document this as a KNOWN PENDING ITEM: Story 7.1 must migrate this preference to `agent_configs.sales_method_id` (FK) and may then remove the temporary `tenants.config` key.

## Tasks / Subtasks

- [ ] Task 1: DB schema for `sales_methods` + migration (AC: #1)
  - [ ] Create `packages/db/src/schema/sales-method.ts`
  - [ ] Define `salesMethodNomeEnum` via `pgEnum('sales_method_nome', ['spin', 'aida', 'storytelling', 'livre'])`
  - [ ] Define `sales_methods` table: `id` (uuid pk, defaultRandom), `nome` (salesMethodNomeEnum, notNull), `titulo` (text notNull), `descricao` (text notNull), `systemPromptTemplate` (text notNull, column `system_prompt_template`), `phases` (jsonb notNull), `isGlobal` (boolean notNull default `false`, column `is_global`), `tenantId` (uuid nullable, column `tenant_id` — null for global methods), `createdAt` (timestamp with timezone, defaultNow notNull)
  - [ ] NOTE: `sales_methods` has NO `updated_at` column (per Architecture §6.7) — do NOT add an `updated_at` trigger to this table
  - [ ] Generate migration `0008_sales_methods.sql` via Drizzle Kit
  - [ ] NOTE: `sales_methods` does NOT need RLS — global records have no `tenant_id`; per-tenant custom methods are a future feature. Do NOT add an RLS policy in this migration.
  - [ ] Re-export `sales-method` schema from `packages/db/src/schema/index.ts`
- [ ] Task 2: Seed for the 4 global sales methods (AC: #1, #4, #5)
  - [ ] Create `packages/db/src/seed/sales-methods.ts` with 4 method objects, all `isGlobal: true`, `tenantId: null`
  - [ ] SPIN: `nome='spin'`, `titulo='SPIN Selling'`; `system_prompt_template` emphasizes Situação → Problema → Implicação → Necessidade; `phases` = ordered array `[{ ordem, nome, objetivo }]` for those 4 phases (pt-BR)
  - [ ] AIDA: `nome='aida'`, `titulo='AIDA'`; template structures Atenção → Interesse → Desejo → Ação; `phases` array for those 4
  - [ ] Storytelling: `nome='storytelling'`, `titulo='Storytelling'`; template structures Identificação → Conflito → Transformação → Convite (4 phases per PRD §MÓDULO 7); `phases` array for those 4. NOTE: do NOT use "Contexto → Conflito → Resolução" — that is incorrect per PRD.
  - [ ] Livre: `nome='livre'`, `titulo='Livre'`; free-form consultative approach; `phases` array with a single open phase
  - [ ] All templates written in Portuguese, focused on the WhatsApp sales context
  - [ ] Make the seed idempotent (upsert on `nome` where `is_global = true`, or skip if already present) so re-runs don't duplicate
  - [ ] Add an npm script `seed:sales-methods` in `packages/db/package.json` (e.g. `tsx src/seed/sales-methods.ts`) OR integrate into the main seed; document which
- [ ] Task 3: Sales methods API (AC: #2)
  - [ ] `GET /sales-methods` — list all global methods (`is_global = true`); no tenant filter needed
  - [ ] Create use case `list-sales-methods.ts` (location: `apps/api/src/use-cases/knowledge/` or a `sales-method/` subfolder) returning all global methods
  - [ ] Register the route in `apps/api/src/app.ts`
- [ ] Task 4: Sales method selector UI (AC: #2, #3)
  - [ ] Create `apps/dashboard/app/(dashboard)/agente/metodo/page.tsx`
  - [ ] Radio card group showing the 4 methods with `titulo`, `descricao`, and phase pills (rendered from each method's `phases`)
  - [ ] On save: persist the selected `sales_method_id` to the `tenants.config` preference key (see Story 7.1 Dependency) via the existing tenant-config endpoint; mark the wiring to `agent_configs` as pending in code comments
  - [ ] Clearly indicate in the UI that this choice affects agent behavior
- [ ] Task 5: Tests (AC: #1, #2)
  - [ ] Unit: the seed produces exactly 4 records, each with a non-empty `system_prompt_template` and a non-empty `phases` array, all `is_global = true`
  - [ ] Unit: `list-sales-methods` returns all 4 global methods

## Dev Notes

- Files to create: `packages/db/src/schema/sales-method.ts`, `packages/db/migrations/0007_sales_methods.sql`, `packages/db/src/seed/sales-methods.ts`, sales-methods Hono route + `list-sales-methods.ts` use case in `apps/api`, `apps/dashboard/app/(dashboard)/agente/metodo/page.tsx`.
- Files to modify: `packages/db/src/schema/index.ts` (re-export sales-method), `packages/db/package.json` (add `seed:sales-methods` script), `apps/api/src/app.ts` (register route).
- npm dependencies: none new — reuse `@leedi/db`, `zod`, `@leedi/ui` (`RadioGroup`/card, `Badge` for phase pills, `Button`). Seed runner uses `tsx` (already in the toolchain).
- `sales_methods` deliberately has NO `updated_at` and NO RLS (Architecture §6.7 + task note). Both are intentional — do not add them.
- **CRITICAL-1 FIX — Migration numbering:** This story's migration is `0008_sales_methods.sql`. Correct sequence: 0004=messages (Epic 4), 0005=leads (5.1), 0006=messaging (5.5), 0007=knowledge (6.1), **0008=sales_methods (this story)**, 0009=agent_schema (7.1). Confirm the next available index in `_journal.json` at implementation time.
- The save target is temporary by design: a `tenants.config` jsonb preference until Story 7.1 introduces `agent_configs.sales_method_id`. Make the pending migration explicit in code comments and in this story's Completion Notes at the end.

### `phases` jsonb shape (suggested)

- Each phase: `{ ordem: number, nome: string, objetivo: string }`, ordered by `ordem`. Keep it stable so Story 7.1 (agent runtime) and the UI phase pills can both read it without transformation.

### Testing standards

- Seed test asserts exactly 4 global records with non-empty `system_prompt_template` and non-empty `phases`; run against local Supabase or a transaction.
- `list-sales-methods` unit test mocks/queries the DB and asserts all 4 are returned.

### Pitfalls to avoid

- Do NOT add `updated_at` or an `updated_at` trigger to `sales_methods` — the schema has no such column.
- Do NOT add RLS to `sales_methods` — global rows have no `tenant_id`.
- Do NOT make the seed non-idempotent — re-running must not create duplicate global methods.
- Do NOT block this story on `agent_configs` — persist to the `tenants.config` preference and flag the Story 7.1 follow-up clearly.
- Do NOT leave `phases` empty for any method (AC #1 requires a non-empty array, including Livre).

### Project Structure Notes

- Schema + migration + seed live in `packages/db`. The list route + use case live in `apps/api`. The selector UI lives in `apps/dashboard` under the Agente section. Only `src/index.ts` is the public surface per package.

### References

- [Source: docs/01-leedi-arquitetura.md#6.7 Sales Method — sales_methods]
- [Source: _bmad-output/planning-artifacts/epics.md#Story 6.4: Sales Methods Seed & Selection]
- [Source: _bmad-output/implementation-artifacts/4-1-whatsapp-connection-schema-encrypted-credential-storage.md] (migration + journal conventions)

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
