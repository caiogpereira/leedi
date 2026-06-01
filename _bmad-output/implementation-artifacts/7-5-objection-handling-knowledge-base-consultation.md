---
baseline_commit: 9ea8a05
---

# Story 7.5: Objection Handling & Knowledge Base Consultation

Status: ready-for-dev

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

- [ ] Task 1: `consultar_base_conhecimento` tool use case (AC: #1, #2, #3, #5)
  - [ ] Create `packages/agent/src/tools/consultar-base-conhecimento.ts`
  - [ ] Input: `{ tenantId: string, tipo: 'faq' | 'objecao', categoria?: string }`
  - [ ] V1 query (Drizzle): `SELECT WHERE tenant_id = tenantId AND tipo = tipo AND ativo = true` and, for `tipo='objecao'`, `AND (categoria IS NULL OR categoria = input.categoria)` when a `categoria` is provided
  - [ ] For `tipo='faq'`: return ALL active FAQs (ignore `categoria`)
  - [ ] For `tipo='objecao'`: filter by `categoria` when provided
  - [ ] No matches → return `{ entries: [] }` (never throw)
  - [ ] Returns `{ entries: Array<{ pergunta_ou_objecao: string, resposta_ou_contorno: string }> }`
  - [ ] V1 is keyword/exact match only — NO vector search (pgvector deferred per Story 6.1)
- [ ] Task 2: Tool definition + toggle wiring in the registry (AC: #1, #4) — integration point is Story 7.2
  - [ ] In `packages/agent/src/tools/registry.ts`, add the JSON Schema: `{ tipo: enum('faq','objecao'), categoria: string (optional) }` with a description of when to use each
  - [ ] This tool is CONFIGURABLE — gated by `tools_habilitadas.consultar_base_conhecimento` in `buildToolList`
  - [ ] Wire into `routeToolCall`; do NOT create a new router
- [ ] Task 3: Objection-detection guidance in the system prompt (AC: #1, #5)
  - [ ] Update `packages/agent/src/utils/build-system-prompt.ts` (from 7.1) to include, only when the tool is enabled, the instruction: "When a lead raises an objection or question, call `consultar_base_conhecimento` first before responding. Match the lead's concern to the most relevant category."
  - [ ] This is a prompt-level nudge, not hard-coded routing
- [ ] Task 4: Record objection journey event (AC: #1) — required by Story 15.2 analytics
  - [ ] In `packages/agent/src/tools/consultar-base-conhecimento.ts`, after returning a non-empty result for `tipo='objecao'`:
    - Call `createLeadJourneyEvent({ tenantId, leadId, tipo: 'objecao', detalhes: { categoria: input.categoria, texto_objecao: entries[0].pergunta_ou_objecao, contorno_usado: entries[0].resposta_ou_contorno } })`
    - Use `@leedi/lead` package's `createJourneyEvent` use case (from Story 5.2)
    - If `entries` is empty (`[]`): do NOT create a journey event (no matching objection to record)
  - [ ] Only record for `tipo='objecao'` — FAQs do NOT generate journey events

- [ ] Task 5: Tests (AC: #1, #2, #3, #4)
  - [ ] Unit: `consultar_base_conhecimento` returns the correct entries for `objecao` + `categoria`; returns all FAQs for `tipo='faq'`; returns `[]` when none match
  - [ ] Unit: journey event is created with correct `detalhes` structure when objection matches
  - [ ] Unit: journey event is NOT created when result is empty `[]`
  - [ ] Unit: journey event is NOT created for `tipo='faq'` queries
  - [ ] Unit: the tool is excluded from `buildToolList` when `tools_habilitadas.consultar_base_conhecimento = false`
  - [ ] Unit: `buildSystemPrompt` includes the objection-handling nudge only when the tool is enabled

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

_not yet assigned_

### Debug Log References

_none_

### Completion Notes List

_not yet implemented_

### File List

_not yet implemented_

### Change Log

_none_
