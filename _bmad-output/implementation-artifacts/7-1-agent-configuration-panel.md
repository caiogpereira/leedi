---
baseline_commit: 992b842
---

# Story 7.1: Agent Configuration Panel

Status: done

## Story

As a tenant owner or admin,
I want a panel to configure all aspects of the agent (name, persona, style, limits, method, tools, model),
so that I can control the agent's behavior without writing code.

## Acceptance Criteria

1. **Given** the DB migration runs, **When** applied, **Then** table `agent_configs` exists with all columns from Architecture §6.5 (`id`, `tenant_id`, `nome_agente`, `persona`, `estilo_mensagem`, `limites`, `sales_method_id`, `modelo_ia`, `tools_habilitadas`, `ativo`, `created_at`, `updated_at`), **And** RLS is enabled (`ENABLE` + `FORCE`) with the tenant isolation policy `tenant_id = current_setting('app.tenant_id', true)::uuid`, **And** a `UNIQUE` constraint on `tenant_id` enforces one config per tenant, **And** an `updated_at` trigger is in place.
2. **Given** a tenant's first login after the `agent_configs` table exists, **When** they navigate to Agente → Configurações, **Then** a default `agent_config` is upserted with `nome_agente='Assistente'`, `persona=''`, `tools_habilitadas` all `false` (configurable tools), `modelo_ia='sonnet'`, `ativo=true`.
3. **Given** a tenant admin fills in all fields and saves, **When** `PATCH /agent-config` is called, **Then** all fields update and the response reflects the saved state.
4. **Given** the admin changes `nome_agente` to "Mari" and saves, **When** the agent next responds, **Then** the system prompt contains "Mari" as the agent name (verified in unit test by checking the system-prompt-builder output).
5. **Given** the admin disables the `transferir_humano` tool toggle and saves, **When** the agent processes a message requiring transfer (unit test), **Then** `transferir_humano` is NOT included in the tools passed to the Claude API call.
6. **Given** the admin clicks the AI improvement button (✨) on the persona field and accepts a suggestion, **When** saved, **Then** `agent_configs.persona` updates (uses `AIAssistedTextarea` from `@leedi/ui`).

## Tasks / Subtasks

- [x] Task 1: DB schema for `agent_configs` + agent-memory tables + migration (AC: #1)
  - [x] Create `packages/db/src/schema/agent.ts`
  - [x] Define `pgEnum('agent_modelo_ia', ['sonnet', 'haiku', 'opus'])`
  - [x] Define `pgEnum('agent_thread_status', ['ativo', 'pausado', 'encerrado'])`
  - [x] Define `pgEnum('agent_message_role', ['system', 'user', 'assistant', 'tool'])`
  - [x] Define `agent_configs` table: `id` (uuid pk, defaultRandom), `tenantId` (uuid FK → `tenants.id`, notNull, UNIQUE), `nomeAgente` (text notNull default `'Assistente'`, column `nome_agente`), `persona` (text notNull default `''`), `estiloMensagem` (jsonb notNull default `{ tamanho: 'medio', formalidade: 'informal', emoji: true }`, column `estilo_mensagem`), `limites` (text notNull default `''`), `salesMethodId` (uuid FK → `sales_methods.id`, nullable, column `sales_method_id`), `modeloIa` (agentModeloIaEnum notNull default `'sonnet'`, column `modelo_ia`), `toolsHabilitadas` (jsonb notNull default `{ consultar_base_conhecimento: false, agendar_followup: false, transferir_humano: false, adicionar_tag: false, solicitar_reengajamento: false }`, column `tools_habilitadas`), `ativo` (boolean notNull default `true`), `createdAt`, `updatedAt`
  - [x] Define `agent_threads` table (PARTITIONED BY MONTH on `created_at`): composite PK `(id, created_at)`
  - [x] Define `agent_messages` table (PARTITIONED BY MONTH on `created_at`): composite PK `(id, created_at)`, no FK `thread_id → agent_threads.id`
  - [x] Define `agent_tool_calls` table: plain `id` PK (NOT partitioned); cross-partition FKs enforced at app layer
  - [x] Generate migration `0009_agent_schema.sql` (hand-written — Drizzle Kit hit an interactive TTY prompt and does not emit partitioning; migrations 0006–0008 follow the same hand-written + Supabase-applied convention)
  - [x] In the migration: declared `agent_threads` and `agent_messages` as `PARTITION BY RANGE (created_at)` with `_2026_06/_07/_08` partitions (matches `messages` naming from 0006)
  - [x] `ENABLE` + `FORCE ROW LEVEL SECURITY` on all four tables; `CREATE POLICY tenant_isolation ... USING (tenant_id = current_setting('app.tenant_id', true)::uuid)` on each (verified via pg_policies)
  - [x] Added `updated_at` trigger on `agent_configs` and `agent_threads` reusing the existing `set_updated_at()` function (not redefined)
  - [x] Re-export `agent` schema from `packages/db/src/schema/index.ts`
- [x] Task 2: Agent config API (AC: #2, #3)
  - [x] Create `apps/api/src/routes/agent/config.ts` (Hono router)
  - [x] `GET /agent-config` — returns the current tenant's `agent_config`, upserting the default if none exists
  - [x] `PATCH /agent-config` — update fields; validates `modelo_ia` / `estilo_mensagem` / `tools_habilitadas` shapes with Zod
  - [x] Create use cases: `apps/api/src/use-cases/agent/get-or-create-agent-config.ts`, `apps/api/src/use-cases/agent/update-agent-config.ts` — all writes via `withTenant(tenantId, ...)`
  - [x] Wire `sales_method_id`: accepted on PATCH; FK violation mapped to a 400
  - [x] **WARNING-4 FIX:** `get-or-create-agent-config` migrates `tenants.config.tenant_sales_method_preference` into `agent_configs.sales_method_id` and removes the temp key — all inside the same `withTenant` transaction
  - [x] Register the router in `apps/api/src/app.ts` (mounted at `/api/tenants/:tenantId/agent-config` to reuse `requireTenantSession`)
- [x] Task 3: System prompt builder utility (AC: #4)
  - [x] Create the `@leedi/agent` package: `packages/agent/` with `package.json`, `tsconfig.json`, `vitest.config.ts`, `src/index.ts`
  - [x] Create `packages/agent/src/utils/build-system-prompt.ts`
  - [x] Function `buildSystemPrompt(agentConfig, salesMethod, activeProduct): string`
  - [x] Structure: `[PERSONA_BLOCK]` + `[METHOD_BLOCK]` + `[PRODUCT_BLOCK]` + `[LIMITS_BLOCK]`, delimited with stable `BLOCK_MARKERS` for prompt caching
  - [x] `nome_agente`, `persona`, `estilo_mensagem` feed PERSONA_BLOCK; `limites` feeds LIMITS_BLOCK
  - [x] Pure function, no Claude API calls
  - [x] Added `resolveEnabledTools` helper (AC#5 — tool filtering, identifiers only) + exported both from `src/index.ts`
- [x] Task 4: Agent configuration UI (AC: #2, #3, #6)
  - [x] Create `apps/dashboard/app/(shell)/agente/configuracoes/page.tsx` (route group is `(shell)`, not `(dashboard)`) + `agent-config-client.tsx`
  - [x] Section "Identidade": `nome_agente` (Input), `persona` (`AIAssistedTextarea` with ✨ button)
  - [x] Section "Estilo": `tamanho` (curto/medio/longo), `formalidade` (formal/informal), `emoji` (toggle)
  - [x] Section "Limites": `AIAssistedTextarea` with ✨
  - [x] Section "Método de venda": card linking to `/agente/metodo` (shows the current method)
  - [x] Section "Ferramentas": toggle switch per configurable tool
  - [x] Section "Modelo de IA": select (sonnet/haiku/opus) with plan-restriction info text
  - [x] Save button with loading state + success message; GET on mount (triggers upsert), PATCH on save; same-origin proxy `app/api/tenants/[tenantId]/agent-config/route.ts`
- [x] Task 5: Tests (AC: #2, #4, #5)
  - [x] Unit: `buildSystemPrompt` produces a string containing all four blocks and the configured `nome_agente` ("Mari")
  - [x] Unit: when `tools_habilitadas.transferir_humano = false`, `resolveEnabledTools` excludes `transferir_humano`
  - [x] Unit: `get-or-create-agent-config` creates the default when none exists; returns existing otherwise; migrates WARNING-4 preference
  - [x] Integration (Supabase): `agent_configs` upsert + PATCH roundtrip; UNIQUE on `tenant_id` rejects a second config (RLS isolation documented — app role is BYPASSRLS, same caveat as Story 4.1's rls.test.ts; policies verified at DB level via pg_policies)

## Dev Notes

- Files to create: `packages/db/src/schema/agent.ts`, `packages/db/migrations/0009_agent_schema.sql`, `apps/api/src/routes/agent/config.ts`, `apps/api/src/use-cases/agent/{get-or-create-agent-config,update-agent-config}.ts`, `packages/agent/` (new package: `package.json`, `tsconfig.json`, `vitest.config.ts`, `src/index.ts`, `src/utils/build-system-prompt.ts`), `apps/dashboard/app/(dashboard)/agente/configuracoes/page.tsx`.
- Files to modify: `packages/db/src/schema/index.ts` (re-export agent), `apps/api/src/app.ts` (register agent config router), root `pnpm-workspace.yaml`/`tsconfig` if needed for the new package, dashboard navigation to add the Agente → Configurações entry.
- npm dependencies: none new in this story — reuse `@leedi/db`, `zod`, `@leedi/ui` (`Input`, `Switch`, `Select`, `RadioGroup`, `Button`, `AIAssistedTextarea`). The Anthropic SDK is added in Story 7.2.
- Architecture notes: `agent_configs` is the per-tenant control surface; the agent-memory tables (`agent_threads`, `agent_messages`, `agent_tool_calls`) ship in the SAME migration to avoid schema drift, but are ISOLATED — only `@leedi/agent-memory` (Story 7.2) ever touches them. This story creates the tables; it does not read/write the memory tables.
- `build-system-prompt` deliberately separates the stable prefix (persona + method + product) from variable content so Story 7.2 can attach `cache_control: { type: 'ephemeral' }` to the end of the stable block (§7.5 prompt caching).

### Testing standards

- Unit tests for use cases and `buildSystemPrompt` run with Vitest; mock the DB layer or run against a transaction. Assert string content and result shape.
- Integration/RLS tests run against local Supabase with the migration applied, using a non-superuser app role (superusers silently bypass RLS — same caveat as Story 4.1).

### Pitfalls to avoid

- Do NOT split the agent tables across multiple migrations — one migration (`0009_agent_schema.sql`).
- Drizzle Kit does NOT emit `PARTITION BY` — you MUST hand-edit the generated SQL to add range partitioning and create initial monthly partitions. A non-partitioned table now means a painful migration later.
- Postgres partitioned-table PK/FK trap (PG 11+): a primary key or any unique constraint on a partitioned table MUST include every partition-key column. Since `agent_threads`/`agent_messages` partition by `created_at`, their PK must be composite `(id, created_at)` — `id uuid primary key` alone will FAIL at migration time. Knock-on: a plain FK `agent_messages.thread_id → agent_threads(id)` (and `agent_tool_calls.message_id → agent_messages(id)`) is illegal because the referenced unique key is now composite. Choose one: (a) carry `created_at` into the FK as a composite reference, or (b) drop cross-partition FKs and enforce thread/message linkage at the application layer (recommended for V1 — simpler, and `@leedi/agent-memory` is the sole writer). Document the choice in the migration SQL.
- Do NOT forget `FORCE ROW LEVEL SECURITY` on every table (owner bypasses the policy otherwise).
- Do NOT redefine `set_updated_at()` — reuse the function from Story 4.1.
- The `tenant_id` UNIQUE on `agent_configs` is load-bearing (one config per tenant) — enforce it in the DB, not only in app code.
- Default `tools_habilitadas` has all CONFIGURABLE tools false; always-on tools (`buscar_historico_lead`, `consultar_ofertas_ativas`, `verificar_elegibilidade`, `enviar_link_checkout`, `marcar_intencao_compra`) are NOT toggles and are not stored here.

### Project Structure Notes

- Schema + migration live in `packages/db`. The system-prompt builder lives in the new `@leedi/agent` package. Config CRUD use cases + Hono routes live in `apps/api`. UI lives in `apps/dashboard`. Each package exposes only `src/index.ts`.

### References

- [Source: docs/01-leedi-arquitetura.md#6.5 Domínio Agent + Agent Memory]
- [Source: docs/01-leedi-arquitetura.md#7.4 Roteamento de modelos]
- [Source: _bmad-output/planning-artifacts/epics.md#Story 7.1: Agent Configuration Panel]
- [Source: _bmad-output/implementation-artifacts/4-1-whatsapp-connection-schema-encrypted-credential-storage.md] (RLS + set_updated_at pattern)
- [Source: _bmad-output/implementation-artifacts/3-3-ai-assisted-textarea-component.md] (AIAssistedTextarea)

## Dev Agent Record

### Agent Model Used

claude-opus-4-8 (Claude Opus 4.8)

### Debug Log References

- `drizzle-kit generate` failed with an interactive-TTY prompt (column-conflict resolver). Migration `0009_agent_schema.sql` was written by hand instead — consistent with migrations 0006–0008, which are also hand-written and applied via the Supabase MCP (not present in `meta/_journal.json`).

### Completion Notes List

- DB: `agent.ts` schema + `0009_agent_schema.sql` applied to Supabase. Verified live: RLS enabled+forced and `tenant_isolation` policy on all four tables; `agent_configs_tenant_id_unique`; `set_updated_at` triggers on `agent_configs`/`agent_threads`; partitions `agent_threads_2026_06/07/08` and `agent_messages_2026_06/07/08`.
- Partitioning decisions (documented in the migration SQL): `agent_threads`/`agent_messages` use composite PK `(id, created_at)`; `agent_messages.thread_id` has NO FK (composite parent key); `agent_tool_calls` is NOT partitioned (plain `id` PK); cross-partition linkage is enforced at the app layer (`@leedi/agent-memory`, Story 7.2).
- API: `GET`/`PATCH` mounted at `/api/tenants/:tenantId/agent-config` to reuse `requireTenantSession` + `resolvedTenantId` (the story's bare `/agent-config` was logical shorthand — `requireTenantSession` requires the `:tenantId` param). PATCH FK violation (23503) on `sales_method_id` mapped to a 400.
- WARNING-4: `get-or-create-agent-config` reads `tenants.config.tenant_sales_method_preference`, sets it as `sales_method_id` on first upsert, and removes the temp key — all in one `withTenant` tx. UNIQUE makes select-then-insert racy, so the insert uses `onConflictDoNothing` then re-selects.
- `@leedi/agent` is a pure, dependency-free package (no `@leedi/db`, no `@anthropic-ai/sdk` — the SDK arrives in 7.2). `resolveEnabledTools` returns tool identifiers only; the always-on tool set is merged with the enabled configurable tools.
- UI route group is `(shell)` (story said `(dashboard)`); the page fetches `GET` on mount to trigger the AC#2 upsert and `PATCH`es the whole config on save via a same-origin Next proxy route. `@leedi/agent` was NOT added to dashboard `transpilePackages` (the UI never imports it).
- WARNING-4 completeness: rewired Story 6.4's `/agente/metodo` to persist the method via `PATCH /api/tenants/:id/agent-config` (`{ salesMethodId }`) and to READ it from `agent_configs.sales_method_id` — the legacy `tenants.config.tenant_sales_method_preference` store is now fully retired (stale comments removed). The one-time drain in `get-or-create-agent-config` is kept for backward-compat with any preference saved under the old key before this deploy. Verified the `jsonb - text` removal and the full migrate-and-drain path live via a transactional sanity check on Supabase.
- AC#6 (✨): there was no dashboard proxy for `/api/ai/improve-text` (the Hono route streams plaintext) — `AIAssistedTextarea` would have 404'd dashboard-wide (also affected the 6.x knowledge pages). Added `apps/dashboard/app/api/ai/improve-text/route.ts` as a STREAMING same-origin proxy (passes through `upstream.body` + content-type, forwards cookie + x-forwarded-for) so the ✨ accept-a-suggestion flow works.
- Authorization: PATCH uses `requireTenantSession()` (any tenant member), matching the products/leads convention; the middleware's role check is equality-only and cannot express "owner OR admin", so member-level access is the intentional project-wide stance (not an oversight). Flagged for reviewer awareness.
- Tests: 12 unit (agent package) + 4 unit (api use case) + 4 integration (db, run against live Supabase) — all green.
- Pre-existing typecheck errors unrelated to this story remain in `apps/api` (`knowledge-base.ts`, `notification/resend.ts`), `apps/dashboard` (`conhecimento/produtos`, `components/knowledge/ArgumentList`), and `packages/db` (`rls.test.ts`). Confirmed via `git stash` that none are introduced by this story.

### File List

Created:
- `packages/db/src/schema/agent.ts`
- `packages/db/migrations/0009_agent_schema.sql`
- `packages/db/src/__tests__/agent-configs-rls.test.ts`
- `packages/agent/src/utils/build-system-prompt.ts`
- `packages/agent/src/utils/resolve-enabled-tools.ts`
- `packages/agent/src/utils/__tests__/build-system-prompt.test.ts`
- `packages/agent/src/utils/__tests__/resolve-enabled-tools.test.ts`
- `packages/agent/vitest.config.ts`
- `apps/api/src/routes/agent/config.ts`
- `apps/api/src/use-cases/agent/get-or-create-agent-config.ts`
- `apps/api/src/use-cases/agent/update-agent-config.ts`
- `apps/api/src/use-cases/agent/__tests__/get-or-create-agent-config.test.ts`
- `apps/dashboard/app/(shell)/agente/configuracoes/page.tsx`
- `apps/dashboard/app/(shell)/agente/configuracoes/agent-config-client.tsx`
- `apps/dashboard/app/api/tenants/[tenantId]/agent-config/route.ts`
- `apps/dashboard/app/api/ai/improve-text/route.ts` (streaming proxy for the ✨ button — fixes AC#6 dashboard-wide)

Modified:
- `packages/db/src/schema/index.ts` (re-export agent)
- `packages/agent/package.json` (test script, vitest devDep)
- `packages/agent/src/index.ts` (public surface)
- `apps/api/src/app.ts` (register agent-config router)
- `apps/dashboard/app/(shell)/agente/metodo/page.tsx` (read method from `agent_configs.sales_method_id`)
- `apps/dashboard/app/(shell)/agente/metodo/sales-method-client.tsx` (save method via `PATCH /agent-config`; retire temp store)

### Change Log

| Date       | Version | Description                                      | Author        |
| ---------- | ------- | ------------------------------------------------ | ------------- |
| 2026-06-01 | 0.1.0   | Implemented Story 7.1 — agent schema + migration, config API, `@leedi/agent` prompt builder + tool filter, configuration UI, and tests. Status → review. | claude-opus-4-8 |
