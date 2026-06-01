---
baseline_commit: 9ea8a05
---

# Story 7.1: Agent Configuration Panel

Status: ready-for-dev

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

- [ ] Task 1: DB schema for `agent_configs` + agent-memory tables + migration (AC: #1)
  - [ ] Create `packages/db/src/schema/agent.ts`
  - [ ] Define `pgEnum('agent_modelo_ia', ['sonnet', 'haiku', 'opus'])`
  - [ ] Define `pgEnum('agent_thread_status', ['ativo', 'pausado', 'encerrado'])`
  - [ ] Define `pgEnum('agent_message_role', ['system', 'user', 'assistant', 'tool'])`
  - [ ] Define `agent_configs` table: `id` (uuid pk, defaultRandom), `tenantId` (uuid FK → `tenants.id`, notNull, UNIQUE), `nomeAgente` (text notNull default `'Assistente'`, column `nome_agente`), `persona` (text notNull default `''`), `estiloMensagem` (jsonb notNull default `{ tamanho: 'medio', formalidade: 'informal', emoji: true }`, column `estilo_mensagem`), `limites` (text notNull default `''`), `salesMethodId` (uuid FK → `sales_methods.id`, nullable, column `sales_method_id`), `modeloIa` (agentModeloIaEnum notNull default `'sonnet'`, column `modelo_ia`), `toolsHabilitadas` (jsonb notNull default `{ consultar_base_conhecimento: false, agendar_followup: false, transferir_humano: false, adicionar_tag: false, solicitar_reengajamento: false }`, column `tools_habilitadas`), `ativo` (boolean notNull default `true`), `createdAt`, `updatedAt`
  - [ ] Define `agent_threads` table (PARTITIONED BY MONTH on `created_at`): `id` (uuid), `tenantId` (uuid notNull), `leadId` (uuid FK → `leads.id`, column `lead_id`), `conversationWindowId` (uuid FK → `conversation_windows.id`, column `conversation_window_id`), `status` (agentThreadStatusEnum notNull default `'ativo'`), `createdAt`, `updatedAt`. PRIMARY KEY MUST be composite `(id, created_at)` — see partitioning pitfall below
  - [ ] Define `agent_messages` table (PARTITIONED BY MONTH on `created_at`): `id` (uuid), `tenantId` (uuid notNull), `threadId` (uuid column `thread_id`), `role` (agentMessageRoleEnum notNull), `content` (jsonb notNull — Anthropic SDK message format), `tokensInput` (integer nullable, column `tokens_input`), `tokensOutput` (integer nullable, column `tokens_output`), `modelo` (text nullable), `custoUsd` (numeric nullable, column `custo_usd`), `createdAt`. PRIMARY KEY MUST be composite `(id, created_at)`. Do NOT add a naive FK `thread_id → agent_threads.id` (the parent's unique key is now composite) — see pitfall
  - [ ] Define `agent_tool_calls` table: `id` (uuid), `tenantId` (uuid notNull), `threadId` (uuid column `thread_id`), `messageId` (uuid nullable, column `message_id`), `toolName` (text notNull, column `tool_name`), `input` (jsonb), `output` (jsonb), `duracaoMs` (integer nullable, column `duracao_ms`), `erro` (text nullable), `createdAt`. Cross-partition FKs to `agent_messages`/`agent_threads` are not viable with composite PKs — enforce integrity at the app layer (see pitfall)
  - [ ] Generate migration `0009_agent_schema.sql` via Drizzle Kit. Correct sequence: 0004=messages (Epic 4), 0005=leads (5.1), 0006=messaging (5.5), 0007=knowledge (6.1), 0008=sales_methods (6.4), **0009=agent_schema (this story)**.
  - [ ] In the migration: declare `agent_threads` and `agent_messages` as `PARTITION BY RANGE (created_at)` and create at least the current + next month partitions (e.g. `agent_threads_yYYYYmMM`). Drizzle Kit does not emit partitioning — hand-edit the generated SQL.
  - [ ] `ENABLE` + `FORCE ROW LEVEL SECURITY` on all four tables; add `CREATE POLICY tenant_isolation ... USING (tenant_id = current_setting('app.tenant_id', true)::uuid)` on each (partitioned parents inherit; also set on partitions if Postgres version requires)
  - [ ] Add `updated_at` trigger on `agent_configs` and `agent_threads` reusing the existing `set_updated_at()` DB function (from Story 4.1) — do NOT redefine it
  - [ ] Re-export `agent` schema from `packages/db/src/schema/index.ts`
- [ ] Task 2: Agent config API (AC: #2, #3)
  - [ ] Create `apps/api/src/routes/agent/config.ts` (Hono router)
  - [ ] `GET /agent-config` — returns the current tenant's `agent_config`, upserting the default if none exists
  - [ ] `PATCH /agent-config` — update fields; validate `modelo_ia` against the enum and `estilo_mensagem` / `tools_habilitadas` shapes with Zod
  - [ ] Create use cases: `apps/api/src/use-cases/agent/get-or-create-agent-config.ts`, `apps/api/src/use-cases/agent/update-agent-config.ts` — all writes via `withTenant(tenantId, ...)`
  - [ ] Wire `sales_method_id`: accept and validate the FK on PATCH (Story 6.4 must be completed before this story)
  - [ ] **WARNING-4 FIX — Migrate temporary preference:** In `get-or-create-agent-config`, when upserting the default config, read `tenants.config.tenant_sales_method_preference` (set by Story 6.4's UI). If present, set `agent_configs.sales_method_id` to that value and remove the temporary preference key from `tenants.config`. This ensures no data is lost when migrating from the Story 6.4 temporary store.
  - [ ] Register the router in `apps/api/src/app.ts`
- [ ] Task 3: System prompt builder utility (AC: #4)
  - [ ] Create the `@leedi/agent` package: `packages/agent/` with `package.json` (`name: "@leedi/agent"`), `tsconfig.json`, `vitest.config.ts`, `src/index.ts`
  - [ ] Create `packages/agent/src/utils/build-system-prompt.ts`
  - [ ] Function `buildSystemPrompt(agentConfig, salesMethod, activeProduct): string`
  - [ ] Structure: `[PERSONA_BLOCK]` + `[METHOD_BLOCK]` + `[PRODUCT_BLOCK]` + `[LIMITS_BLOCK]`, each clearly delimited with stable markers so the stable prefix can be cached (see §7.5)
  - [ ] `nome_agente`, `persona`, `estilo_mensagem` feed the PERSONA_BLOCK; `limites` feeds LIMITS_BLOCK
  - [ ] Pure function, no Claude API calls — fully unit testable
  - [ ] Export from `packages/agent/src/index.ts`
- [ ] Task 4: Agent configuration UI (AC: #2, #3, #6)
  - [ ] Create `apps/dashboard/app/(dashboard)/agente/configuracoes/page.tsx`
  - [ ] Section "Identidade": `nome_agente` (Input), `persona` (`AIAssistedTextarea` with ✨ button)
  - [ ] Section "Estilo": `tamanho` (curto/medio/longo), `formalidade` (formal/informal), `emoji` (toggle)
  - [ ] Section "Limites": textarea with ✨ (`AIAssistedTextarea`)
  - [ ] Section "Método de venda": radio cards linking to `/agente/metodo` (Story 6.4)
  - [ ] Section "Ferramentas": toggle switch per configurable tool (`consultar_base_conhecimento`, `agendar_followup`, `transferir_humano`, `adicionar_tag`, `solicitar_reengajamento`)
  - [ ] Section "Modelo de IA": select (sonnet/haiku/opus) with plan-restriction info text
  - [ ] Save button with loading state + success toast; fetch from `GET /agent-config`, persist via `PATCH /agent-config`
- [ ] Task 5: Tests (AC: #2, #4, #5)
  - [ ] Unit: `buildSystemPrompt` produces a string containing all four blocks and the configured `nome_agente` ("Mari")
  - [ ] Unit: when `tools_habilitadas.transferir_humano = false`, the tool list built for the Claude call excludes `transferir_humano` (test the filtering helper; full loop tested in 7.2)
  - [ ] Unit: `get-or-create-agent-config` creates the default when none exists; returns existing otherwise
  - [ ] Integration (Supabase): `agent_configs` upsert + PATCH roundtrip; UNIQUE on `tenant_id` rejects a second config; RLS prevents cross-tenant reads

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

_not yet assigned_

### Debug Log References

_none_

### Completion Notes List

_not yet implemented_

### File List

_not yet implemented_

### Change Log

_none_
