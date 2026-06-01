---
baseline_commit: 9ea8a05
---

# Story 7.6: Human Transfer Tool

Status: ready-for-dev

## Story

As a lead who needs more personalized attention,
I want to be transferred to a human when the agent determines it's necessary,
so that complex situations are handled by a person.

## Acceptance Criteria

1. **Given** the agent calls `transferir_humano` with a `motivo`, **When** executed, **Then** the agent sends to the lead: "Vou te conectar com um de nossos especialistas. Um momento!", **And** an `inbox_assignments` record is upserted with `status='aguardando_humano'`, **And** a handoff summary is generated using Claude Haiku.
2. **Given** the handoff summary is generated, **When** stored, **Then** `inbox_assignments.resumo_handoff` contains: quem é o lead, o que quer, objeções levantadas, temperatura, motivo da transferência, e a resposta sugerida ao operador.
3. **Given** `transferir_humano` is called, **When** executed, **Then** a notification event is emitted (or queued) for all operators in the tenant: `{ tipo: 'lead_pediu_humano', leadName, tenantId }`.
4. **Given** the agent is paused for a lead (`inbox_assignments.status` IN (`'aguardando_humano'`, `'em_atendimento'`)), **When** a new message arrives from that lead, **Then** `process-message` checks the inbox status and SKIPS agent processing (no Claude call), **And** saves the message to `messages` with `autor='lead'`.
5. **Given** the `transferir_humano` tool is toggled OFF in `agent_config`, **When** the agent encounters a situation requiring transfer, **Then** the tool is NOT included in the tools array, **And** the agent handles the conversation itself.

## Tasks / Subtasks

- [ ] Task 1: `transferir_humano` tool use case (AC: #1, #2, #3)
  - [ ] Create `packages/agent/src/tools/transferir-humano.ts`
  - [ ] Input: `{ tenantId: string, leadId: string, threadId: string, conversationWindowId: string, motivo: string, conversationSummary: string }`
  - [ ] Generate the handoff summary: call Claude Haiku with the structured prompt from Task 3 (output sections: lead_name, what_they_want, objections, temperatura, motivo, suggested_response)
  - [ ] Upsert `inbox_assignments`: `{ tenantId, conversationWindowId, status: 'aguardando_humano', resumo_handoff, motivo_handoff: motivo }`
  - [ ] Send the WhatsApp message via `MetaCloudProvider.sendText()`: "Vou te conectar com um de nossos especialistas. Um momento!" (persist to `messages`, `autor='agente'`)
  - [ ] Emit the operator notification: create a journey event + a notification record `{ tipo: 'lead_pediu_humano', leadName, tenantId }` (actual push delivery is Epic 18 — just persist/queue here)
  - [ ] Update the agent thread status to `pausado` via `@leedi/agent-memory.updateThreadStatus`
  - [ ] Return `{ transferred: true, assignmentId: string }`
- [ ] Task 2: Agent pause check in `process-message` (AC: #4)
  - [ ] In `packages/agent/src/use-cases/process-message.ts` (from 7.2), after loading the `conversation_window`, check `inbox_assignments` for that window
  - [ ] If `status` IN (`'aguardando_humano'`, `'em_atendimento'`) → save the inbound message to `messages` (`autor='lead'`) and RETURN EARLY (no Claude call)
  - [ ] Add this to the `should_abort` checks alongside optout/blocked/already-bought
- [ ] Task 3: Handoff summary prompt builder (AC: #2)
  - [ ] Create `packages/agent/src/utils/build-handoff-prompt.ts`
  - [ ] Builds a Haiku prompt from the thread history to produce a structured handoff summary
  - [ ] Output format: markdown with clear sections — Sobre o Lead, O que quer, Objeções, Temperatura, Motivo, Próximo passo sugerido
  - [ ] Pure function (prompt assembly only); the Haiku call lives in the tool use case
- [ ] Task 4: Tool definition + toggle wiring in the registry (AC: #1, #5) — integration point is Story 7.2
  - [ ] In `packages/agent/src/tools/registry.ts`, add the JSON Schema: `{ motivo: string, conversationSummary: string }`
  - [ ] CONFIGURABLE — gated by `tools_habilitadas.transferir_humano` in `buildToolList`
  - [ ] Wire into `routeToolCall`; do NOT create a new router
- [ ] Task 5: Tests (AC: #1, #2, #3, #4)
  - [ ] Unit: `transferir_humano` generates the handoff summary via Haiku (mocked) and upserts the `inbox_assignment` with `status='aguardando_humano'` and a populated `resumo_handoff`
  - [ ] Unit: `process-message` skips the agent (no Claude call) when inbox status is `aguardando_humano`, and still saves the inbound message as `autor='lead'`
  - [ ] Unit: the operator notification event is emitted with `{ tipo: 'lead_pediu_humano', leadName, tenantId }`
  - [ ] Unit: the tool is excluded from `buildToolList` when toggled off

## Dev Notes

- Files to create: `packages/agent/src/tools/transferir-humano.ts`, `packages/agent/src/utils/build-handoff-prompt.ts`.
- Files to modify: `packages/agent/src/use-cases/process-message.ts` (inbox-pause `should_abort` check), `packages/agent/src/tools/registry.ts` (schema + toggle + routing).
- npm dependencies: none new — `@anthropic-ai/sdk` (Haiku, already added in 7.2), `@leedi/connection`, `@leedi/db`, `@leedi/agent-memory`.
- `inbox_assignments` comes from Epic 5. The notification record is persisted/queued here; real push delivery is Epic 18 — do not build delivery now.
- Haiku for the handoff summary: interim hardcoded model id is fine; Story 7.8 canonicalizes it as `TASK_MODELS.handoff_summary`. Leave a TODO referencing 7.8.
- @leedi/agent-memory isolation: thread status changes go through `updateThreadStatus`; the tool never touches `agent_threads` directly.

### Testing standards

- Unit tests mock the Anthropic client, `@leedi/connection`, and the DB layer. Assert the upsert shape, the pause/skip path, and the notification payload.

### Pitfalls to avoid

- Do NOT call Claude when the inbox is paused (AC #4) — that is the whole point of the handoff; saving the lead message and returning early is mandatory.
- Do NOT use Sonnet for the handoff summary — Haiku only (cost). Story 7.8 enforces this centrally.
- Send the lead-facing message EXACTLY as specified — the lead reads this literal text.
- The upsert must be idempotent on `conversation_window_id` — a repeated transfer should not create duplicate assignments.
- Persist the operator notification even though delivery is Epic 18 — otherwise the handoff is silent.

### Project Structure Notes

- Tool implementation + handoff prompt builder live in `packages/agent`. The pause check is the one change to `process-message`. Registered once in `registry.ts`.

### References

- [Source: docs/01-leedi-arquitetura.md#7.3 As tools (ferramentas) do agente]
- [Source: docs/01-leedi-arquitetura.md#7.4 Roteamento de modelos]
- [Source: _bmad-output/planning-artifacts/epics.md#Story 7.6: Human Transfer Tool]
- [Source: _bmad-output/implementation-artifacts/7-2-agent-core-processing-loop.md] (process-message should_abort + tool registry)
- [Source: _bmad-output/implementation-artifacts/7-8-model-routing-cost-optimization.md] (Haiku routing canonicalization)

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
