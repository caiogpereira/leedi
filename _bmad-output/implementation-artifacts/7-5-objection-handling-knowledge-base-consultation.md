---
baseline_commit: 992b842
---

# Story 7.5: Objection Handling & Knowledge Base Consultation

Status: review

## Story

As a lead with doubts,
I want the agent to address my objections thoughtfully,
so that my concerns are resolved and I can make a confident purchase decision.

## Acceptance Criteria

1. **Given** a lead raises an objection, **When** the agent calls `consultar_base_conhecimento` with a relevant `categoria`, **Then** the tool queries `knowledge_base` for `tipo='objecao'` AND matching `categoria`, **And** returns an array of `{ pergunta_ou_objecao, resposta_ou_contorno }` objects.
2. **Given** the agent calls `consultar_base_conhecimento` for FAQs (`tipo='faq'`), **When** executed, **Then** all active FAQ entries are returned (no `categoria` filter for FAQ).
3. **Given** no matching entries are found for the given `categoria`, **When** the tool returns, **Then** it returns an empty array `[]` and the agent responds based on persona and method (no error / no halting).
4. **Given** the `consultar_base_conhecimento` tool is toggled OFF in `agent_config.tools_habilitadas`, **When** the agent processes a message, **Then** the tool is NOT included in the tools array passed to Claude, **And** the agent still handles the conversation without it.
5. **Given** a V1 keyword search matches multiple objection entries for `categoria='preco'`, **When** returned to the agent, **Then** the agent picks the most contextually relevant one (Claude's judgment — the tool simply returns all matches).

## Tasks / Subtasks

- [x] Task 1: `consultar_base_conhecimento` tool use case (AC: #1, #2, #3, #5)
  - [x] Create `packages/agent/src/tools/consultar-base-conhecimento.ts`
  - [x] Input: model-supplied `{ tipo: 'faq' | 'objecao', categoria?: string }`; `tenantId`/`leadId` come from `ToolContext` (schema-vs-ctx boundary)
  - [x] V1 query (Drizzle): `SELECT WHERE tenant_id = tenantId AND ativo = true AND tipo = tipo` and, for `tipo='objecao'`, `AND (categoria IS NULL OR categoria = input.categoria)` when a `categoria` is provided
  - [x] For `tipo='faq'`: return ALL active FAQs (ignore `categoria`)
  - [x] For `tipo='objecao'`: filter by `categoria` when provided (NULL-categoria rows stay in scope)
  - [x] No matches → return `{ entries: [] }` (never throw)
  - [x] Returns `{ entries: Array<{ pergunta_ou_objecao: string, resposta_ou_contorno: string }> }`
  - [x] V1 is keyword/exact match only — NO vector search (pgvector deferred per Story 6.1)
- [x] Task 2: Tool definition + toggle wiring in the registry (AC: #1, #4) — integration point is Story 7.2
  - [x] In `packages/agent/src/tools/registry.ts`, replaced the stale `{ consulta, tipo? }` schema with `{ tipo: enum('faq','objecao') [required], categoria: string (optional) }` with usage descriptions
  - [x] This tool is CONFIGURABLE — gated by `tools_habilitadas.consultar_base_conhecimento` in `buildToolList`
  - [x] Wired into `routeToolCall`; no new router
- [x] Task 3: Objection-detection guidance in the system prompt (AC: #1, #5)
  - [x] Updated `packages/agent/src/utils/build-system-prompt.ts` (4th optional `enabledToolIds` param) to append the objection nudge to the LIMITS block ONLY when the tool is enabled
  - [x] This is a prompt-level nudge, not hard-coded routing
- [x] Task 4: Record objection journey event (AC: #1) — required by Story 15.2 analytics
  - [x] In `consultar-base-conhecimento.ts`, after a non-empty `tipo='objecao'` result, INSERT `lead_journey_events { tenantId, leadId, tipo: 'objecao', detalhes: { categoria, texto_objecao, contorno_usado } }`
  - [x] No `createJourneyEvent` use case exists in `@leedi/lead` — inserted directly via `withTenant` (same pattern as `marcar-intencao-compra.ts`)
  - [x] If `entries` is empty (`[]`): no journey event
  - [x] Only record for `tipo='objecao'` — FAQs do NOT generate journey events

- [x] Task 5: Tests (AC: #1, #2, #3, #4)
  - [x] Unit: returns correct entries for `objecao` + `categoria`; returns all FAQs for `tipo='faq'`; returns `[]` when none match
  - [x] Unit: journey event created with correct `detalhes` when objection matches
  - [x] Unit: journey event NOT created when result is empty `[]`
  - [x] Unit: journey event NOT created for `tipo='faq'` queries
  - [x] Unit: tool excluded from `buildToolList` when `tools_habilitadas.consultar_base_conhecimento = false`
  - [x] Unit: `buildSystemPrompt` includes the objection nudge only when the tool is enabled

## Dev Notes

- Files to create: `packages/agent/src/tools/consultar-base-conhecimento.ts`.
- Files to modify: `packages/agent/src/tools/registry.ts` (schema + toggle + routing), `packages/agent/src/utils/build-system-prompt.ts` (conditional objection nudge).
- **Journey event dependency:** Task 4 calls `createLeadJourneyEvent` from `@leedi/lead`. Verify the `lead_journey_events` table and the `createJourneyEvent` use case exist (created in Story 5.2). The `detalhes` column is JSONB — store as `{ categoria, texto_objecao, contorno_usado }`. Story 15.2 queries this JSON for objection analytics.
- npm dependencies: none new — reuse `@leedi/db` (`withTenant`, `schema`, `eq`, `and`).
- `knowledge_base` comes from Epic 6 (Story 6.1/6.3) with columns `tipo`, `pergunta_ou_objecao`, `resposta_ou_contorno`, `categoria`, `ativo`. V1 is keyword match; the `embedding` column stays deferred — do NOT introduce vector search here.
- @leedi/agent-memory isolation applies: this tool reads `knowledge_base` (NOT agent-memory) and is dispatched from the 7.2 loop.

### Testing standards

- Unit tests mock the DB layer; cover the FAQ-vs-objection branching, the categoria filter, and the empty-result path.

### Pitfalls to avoid

- Do NOT throw on empty results — return `[]` so the agent gracefully falls back to persona/method (AC #3).
- Do NOT add the objection nudge to the system prompt when the tool is disabled — it would instruct Claude to call a tool that isn't available.
- Do NOT implement vector/semantic search — V1 is keyword/exact only (pgvector deferred per Story 6.1).
- Keep the returned payload bounded — objections can be many; consider a sane LIMIT for token cost if the catalog is large.

### Project Structure Notes

- Tool implementation in `packages/agent/src/tools/`; registered once in `registry.ts`. The only prompt change is the conditional objection nudge in the shared `build-system-prompt` util.

### References

- [Source: docs/01-leedi-arquitetura.md#7.3 As tools (ferramentas) do agente]
- [Source: _bmad-output/planning-artifacts/epics.md#Story 7.5: Objection Handling & Knowledge Base Consultation]
- [Source: _bmad-output/implementation-artifacts/6-1-product-catalog-crud.md] (knowledge_base schema + pgvector deferral)
- [Source: _bmad-output/implementation-artifacts/7-2-agent-core-processing-loop.md] (tool registry integration)
- [Source: _bmad-output/implementation-artifacts/7-1-agent-configuration-panel.md] (build-system-prompt)

## Dev Agent Record

### Agent Model Used

claude-opus-4-8

### Debug Log References

_none_

### Completion Notes List

- **Schema correction (Task 2):** The pre-existing `consultar_base_conhecimento` registry schema exposed `{ consulta (required), tipo? }`, which could not satisfy AC#1/#5 (Claude must supply `categoria`). Replaced it with the story-specified `{ tipo (required), categoria? }`. Confirmed via grep that nothing else consumed `consulta`. Editing the schema does not affect prompt caching (cache stability depends on per-message determinism + tool order, not schema freezing).
- **NULL-categoria objections (Task 1):** Did NOT reuse `searchKnowledgeBase` from `@leedi/knowledge` for the objection path — its strict `eq(categoria, x)` filter would silently drop the general (NULL-categoria) contours the spec requires. Implemented the `(categoria IS NULL OR categoria = input.categoria)` filter inline via `or(isNull(...), eq(...))`. FAQ path applies no categoria filter (AC#2).
- **Payload bound:** Applied `LIMIT 20` to keep token cost bounded on large catalogs.
- **Journey event (Task 4):** No `createJourneyEvent` use case exists in `@leedi/lead`, so the `lead_journey_events` row is inserted directly inside the same `withTenant` transaction (mirrors `marcar-intencao-compra.ts`). Objection-only, non-empty-only. `categoria` stored as `null` when not supplied.
- **System prompt (Task 3):** `buildSystemPrompt` gained an optional 4th param `enabledToolIds: readonly string[] = []` — backward compatible (the byte-stable cache test and all 3-arg call sites stay valid). The nudge is appended to the LIMITS block only when `consultar_base_conhecimento` is in the list. `process-message.ts` now builds the tool list FIRST and passes `tools.map(t => t.name)` so the nudge exactly tracks the tools offered to Claude.
- **Verification:** `pnpm --filter @leedi/agent test` → 76 passed (13 files). `tsc --noEmit` clean.

### File List

- `packages/agent/src/tools/consultar-base-conhecimento.ts` (new) — tool use case
- `packages/agent/src/tools/__tests__/consultar-base-conhecimento.test.ts` (new) — unit tests
- `packages/agent/src/tools/registry.ts` (modified) — schema fix + import + `routeToolCall` wiring
- `packages/agent/src/tools/__tests__/registry.test.ts` (modified) — toggle/schema tests (AC#4)
- `packages/agent/src/utils/build-system-prompt.ts` (modified) — optional `enabledToolIds` param + objection nudge
- `packages/agent/src/utils/__tests__/build-system-prompt.test.ts` (modified) — nudge gating tests
- `packages/agent/src/use-cases/process-message.ts` (modified) — reorder buildToolList before buildSystemPrompt; pass enabled tool IDs
- `packages/agent/src/index.ts` (modified) — export the new tool + types

### Change Log

- 2026-06-01: Implemented Story 7.5 — `consultar_base_conhecimento` tool (FAQ + objection lookup, keyword/exact V1), registry schema correction + wiring, conditional objection nudge in the system prompt, objection journey event. All tests passing.
