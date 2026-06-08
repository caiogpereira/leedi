---
baseline_commit: 992b842
---

# Story 8.2: Scenario Simulation & Tool Transparency

Status: review

## Story

As a tenant operator,
I want to simulate different lead scenarios and see exactly which tools the agent calls during the conversation,
so that I can validate the agent's decision-making and knowledge base before going live.

## Acceptance Criteria

1. **Given** the operator selects "Lead recorrente" scenario, **When** the playground initializes, **Then** the agent's context includes synthetic historical data: a prior thread with 5 messages (one of which is a previously recorded objection), `comprou: false`, and a warm temperature — and the agent's opening message references the prior interaction (e.g. "Que bom te ver novamente!").
2. **Given** the operator selects "Lead com objeção" scenario, **When** the playground initializes, **Then** the conversation opens with an injected user message ("Achei caro, não vale o preço") so the agent immediately calls `consultar_base_conhecimento` for the "preco" category in its first turn.
3. **Given** the agent calls any tool during a playground conversation, **When** the tool executes, **Then** a collapsible tool-call panel appears below the agent's response bubble showing: tool name, JSON input (pretty-printed), and JSON output (pretty-printed).
4. **Given** multiple tools are called in a single agent turn (e.g. `buscar_historico_lead` then `consultar_ofertas_ativas`), **When** the response arrives, **Then** all tool calls are shown as separate expandable panels in the order they were executed.
5. **Given** the operator changes the agent configuration (e.g., updates persona or disables a tool toggle) and returns to the playground, **When** a new session starts (after clicking "Reiniciar conversa"), **Then** the updated config is reflected in the next conversation — the old session uses the old config.
6. **Given** the operator has been conversing for 10+ turns, **When** scrolling the chat, **Then** all previous tool-call panels remain visible and collapsible (not pruned from the UI).

## Tasks / Subtasks

- [x] Task 1: Scenario data builders (AC: #1, #2)
  - [x] Create `apps/api/src/routes/playground/scenarios.ts`
  - [x] `buildScenarioContext(scenario: 'novo_lead' | 'lead_recorrente' | 'lead_com_objecao'): PlaygroundScenarioContext` where `PlaygroundScenarioContext` includes: `syntheticHistory: AnthropicHistoryMessage[]` (pre-built thread messages in Anthropic format), `initialUserMessage?: string` (for "lead com objeção" only)
  - [x] "Novo lead": empty history
  - [x] "Lead recorrente": history with 5 messages (2 user + 2 assistant + 1 user with objection "preço"); injected via seedHistory
  - [x] "Lead com objeção": empty base history + `initialUserMessage: "Achei caro, não vale o preço"` injected as the first user message before the agent turn
  - [x] Export from the playground router; consume in `POST /playground/message` on session init
- [x] Task 2: Tool transparency in API response (AC: #3, #4)
  - [x] `ToolCallLog[]` collected in-memory in `runToolLoop` sandbox path (chronological order)
  - [x] Response shape: `{ sessionId, segments: string[], toolCalls: ToolCallLog[], turn: number }` where `ToolCallLog = { toolName; input; output; durationMs? }`
  - [x] `durationMs` is wall time from `Date.now()` before/after `routeToolCall` call
- [x] Task 3: Tool transparency UI component (AC: #3, #4, #6)
  - [x] Created `apps/dashboard/app/(shell)/agente/playground/_components/ToolCallPanel.tsx`
  - [x] `<ToolCallPanel toolCalls={ToolCallLog[]} />` — renders a vertical stack of panels below the agent bubble
  - [x] Each panel: collapsible `<details>` element with `<summary>` showing tool name + duration badge; expanded content shows pretty-printed JSON for input/output side by side
  - [x] Collapsed by default; keyboard accessible (native `<details>` handles Enter/Space)
  - [x] Styled with violet/indigo left border; empty array → renders nothing
- [x] Task 4: Config hot-reload on session reset (AC: #5)
  - [x] `DELETE /playground/session/:sessionId` clears the Redis session key
  - [x] `POST /playground/message` with no `sessionId` creates a fresh session — calls `loadAgentContext` on every new session (no cross-session cache)
  - [x] UI: "Reiniciar conversa" calls DELETE, clears local state including `sessionId`

## Dev Notes

- Files to create: `apps/api/src/routes/playground/scenarios.ts`, `apps/dashboard/app/(shell)/agente/playground/_components/ToolCallPanel.tsx`.
- Files to modify: `apps/api/src/routes/playground/index.ts` (consume scenarios, include toolCalls in response).
- This story depends on Story 8.1 being complete (sandbox seam exists and returns `ToolCallLog[]`).
- The "Lead recorrente" synthetic history must be shaped exactly as `{ role: 'user' | 'assistant'; content: string | ContentBlock[] }` entries matching the Anthropic SDK format — so they can be passed directly to `process-message` as pre-existing thread history without modification.
- Do NOT expose tool internal fields that could leak tenant data from another session (the synthetic lead's phone number in tool inputs should be a clearly fake number like `+5511999000001`).
- npm dependencies: none new.

### Testing standards

- Unit: `buildScenarioContext('lead_recorrente')` returns exactly 5 pre-built history messages with the correct Anthropic message format.
- Unit: `buildScenarioContext('lead_com_objecao')` returns `initialUserMessage: "Achei caro..."`.
- Unit: `ToolCallPanel` with 3 tool calls renders 3 `<details>` elements; with empty array renders nothing.
- No E2E automation — manual testing during playground trial run.

### Pitfalls to avoid

- Do NOT inject the synthetic history into the real `agent_threads`/`agent_messages` tables — it must stay in the transient Redis session.
- Do NOT display raw tool input if it contains the synthetic phone number in a way that could confuse operators into thinking it's a real lead.
- The `<details>` collapse must be purely CSS/HTML — do NOT add React state for open/closed per-panel (browser handles it natively).

### Project Structure Notes

- Scenario builders live in the playground route folder (`apps/api/src/routes/playground/`). Tool transparency component lives in the playground page's `_components/` folder. No new packages.

### References

- [Source: docs/01-leedi-arquitetura.md#7.2 Fluxo de uma mensagem]
- [Source: _bmad-output/planning-artifacts/epics.md#Story 8.2: Scenario Simulation & Tool Transparency]
- [Source: _bmad-output/implementation-artifacts/8-1-playground-chat-interface.md] (sandbox seam + ToolCallLog type)
- [Source: _bmad-output/implementation-artifacts/7-3-lead-context-tools-history-offers-eligibility.md] (buscar_historico_lead, consultar_ofertas_ativas)
- [Source: _bmad-output/implementation-artifacts/7-5-objection-handling-knowledge-base-consultation.md] (consultar_base_conhecimento)

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

- Scenario builders use Redis-only (no DB writes); synthetic history passed via seedHistory to process-message.
- ToolCallPanel uses native `<details>`/`<summary>` — no React state for open/closed (as per pitfall note).

### Completion Notes List

- `buildScenarioContext` in `scenarios.ts` produces 5-message history for lead_recorrente and initialUserMessage for lead_com_objecao
- `ToolCallLog[]` collected chronologically in `runToolLoop` sandbox path; durationMs from wall clock
- API response includes `{ sessionId, segments, toolCalls, turn }`
- `ToolCallPanel` component: collapsible details, violet border, JSON side-by-side, empty → null
- Config hot-reload: no cross-session agent config cache; DELETE clears Redis key
- 4 unit tests for scenario builders

### File List

- apps/api/src/routes/playground/scenarios.ts (created)
- apps/api/src/routes/playground/__tests__/scenarios.test.ts (created)
- apps/api/src/routes/playground/index.ts (modified — consumes scenarios, includes toolCalls)
- apps/dashboard/app/(shell)/agente/playground/_components/ToolCallPanel.tsx (created)

### Change Log

- feat(scenarios): buildScenarioContext for 3 playground scenarios (Story 8.2)
- feat(tool-transparency): ToolCallPanel component with collapsible details (Story 8.2)
