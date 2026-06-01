---
baseline_commit: 9ea8a05
---

# Story 8.1: Playground Chat Interface

Status: ready-for-dev

## Story

As a tenant operator,
I want an in-dashboard chat interface that simulates a WhatsApp conversation with my agent using the current configuration,
so that I can verify the agent behaves correctly before releasing it to real leads.

## Acceptance Criteria

1. **Given** a tenant operator navigates to Agente → Playground, **When** the page loads, **Then** a chat interface is shown with: (a) a campaign selector dropdown listing all tenant campaigns (plus "Sem campanha ativa"), (b) a scenario selector (Novo lead / Lead recorrente / Lead com objeção), (c) a message input and send button.
2. **Given** the operator sends a message, **When** the agent processes it, **Then** the response is generated using the exact same `process-message` use case from Story 7.2, with `sandboxMode: true` injected via the context — no real WhatsApp message is sent via `MetaCloudProvider`, no `conversation_window` is created with `billable: true`, and no `usage_counters.conversas_usadas` is incremented.
3. **Given** `sandboxMode: true` is set, **When** `process-message` would normally call `MetaCloudProvider.sendText()`, **Then** it is bypassed and the text segments are returned directly to the caller for display in the chat UI.
4. **Given** `sandboxMode: true`, **When** a new conversation window would normally be opened, **Then** the window is created with `billable: false` (or not created at all — either approach is acceptable as long as no counter is incremented).
5. **Given** the operator sends a message, **When** the playground session renders the response, **Then** the response appears visually styled to simulate a WhatsApp bubble layout (lead messages on left, agent messages on right), and multi-segment responses appear as sequential bubbles.
6. **Given** the operator changes the campaign selection and sends a new message, **When** processed, **Then** the active campaign context switches and `consultar_ofertas_ativas` returns the newly selected campaign's product.

## Tasks / Subtasks

- [ ] Task 1: Sandbox seam in `process-message` (AC: #2, #3, #4)
  - [ ] Add `sandboxMode?: boolean` to the `ProcessMessageContext` interface in `packages/agent/src/use-cases/process-message.ts`
  - [ ] When `sandboxMode: true`: skip the `MetaCloudProvider.sendText()` call; instead collect all segment strings and return them as `{ segments: string[], toolCalls: ToolCallLog[] }` to the caller
  - [ ] When `sandboxMode: true`: skip billable `conversation_window` creation; use a transient in-memory thread (or create `agent_threads` row with `sandboxMode: true` flag if persistence is needed for multi-turn) — ensure `usage_counters` is NEVER incremented
  - [ ] When `sandboxMode: true`: still persist `agent_messages` and `agent_tool_calls` (tool transparency requires the log — see Story 8.2); skip only billing/sending side effects
  - [ ] Add a `ToolCallLog` type: `{ toolName: string; input: unknown; output: unknown }` returned in `processMessage` result when `sandboxMode: true`
  - [ ] Unit test: `process-message` with `sandboxMode: true` does NOT call `MetaCloudProvider.sendText()` (verify with mock)
  - [ ] Unit test: `usage_counters` increment is NOT triggered when `sandboxMode: true`
- [ ] Task 2: Playground API endpoint (AC: #2, #6)
  - [ ] Create `apps/api/src/routes/playground/index.ts` (Hono router)
  - [ ] `POST /playground/message` — accepts `{ message: string; campaignId?: string; scenario: 'novo_lead' | 'lead_recorrente' | 'lead_com_objecao'; sessionId?: string }` — validates with Zod — invokes `process-message` with `sandboxMode: true` — returns `{ sessionId, segments: string[], toolCalls: ToolCallLog[] }`
  - [ ] `DELETE /playground/session/:sessionId` — clears the in-memory/transient session to reset the conversation
  - [ ] Use a transient playground identity: a synthetic `lead` object built from the selected scenario (do NOT create real leads rows for playground sessions)
  - [ ] Register the router in `apps/api/src/app.ts` behind the `operator` RBAC guard
- [ ] Task 3: Playground UI page (AC: #1, #5, #6)
  - [ ] Create `apps/dashboard/app/(shell)/agente/playground/page.tsx`
  - [ ] Header controls: campaign selector (TanStack Query fetch from `GET /campaigns?status=ativa`) + scenario selector (radio/select)
  - [ ] Chat area: scrollable message list, WhatsApp-style bubbles (lead = left/gray, agent = right/indigo), multi-segment renders as sequential bubbles with ~300ms stagger
  - [ ] Input area: textarea (single-line Enter send, Shift+Enter newline), send button with loading state
  - [ ] "Reiniciar conversa" button calls `DELETE /playground/session/:id` and resets local state
  - [ ] Optimistic message display: show the operator's message immediately before the response arrives
  - [ ] TanStack Query mutation for `POST /playground/message`; handle loading and error states
- [ ] Task 4: Sidebar navigation link (AC: #1)
  - [ ] Add "Playground" link to the Agente section in `apps/dashboard/app/(shell)/layout.tsx` (or the sidebar component from Story 3.1)
  - [ ] RBAC: visible to `owner`, `admin`, `operator`; hidden from `viewer`

## Dev Notes

- Files to create: `apps/api/src/routes/playground/index.ts`, `apps/dashboard/app/(shell)/agente/playground/page.tsx`.
- Files to modify: `packages/agent/src/use-cases/process-message.ts` (add `sandboxMode` to context + return type), `apps/api/src/app.ts` (register playground router), dashboard sidebar navigation component.
- The sandbox seam must be a first-class parameter in `ProcessMessageContext` — NOT a global flag or environment variable — so the same unit tests can assert sandbox vs. live behavior in isolation.
- The synthetic lead for scenarios: "Novo lead" = no history, no purchases; "Lead recorrente" = has a prior `agent_thread` with 5 historical messages and a previously recorded objection; "Lead com objeção" = inject a canned objection into the conversation history so the agent's first response involves consulting the knowledge base.
- Do NOT create real `leads` rows for playground sessions. Use an ephemeral object shaped like a lead for context building.
- Multi-turn playground requires session state. Simple approach: store session context (thread history, synthetic lead) in Redis with a `playground:{tenantId}:{sessionId}` key and a 30-minute TTL. No DB persistence needed.
- **Dependência cross-epic (AC #6 — campaign selector):** o selector de campanha é funcional na UI a partir desta story, mas a troca de campanha só afeta o resultado de `consultar_ofertas_ativas` após a implementação de **Story 10.3** (que torna a tool campaign-aware). Durante o Epic 8, a seleção de `campaignId` é passada no contexto mas a tool ainda retorna produtos diretamente (comportamento da Story 7.3). Implementar a integração completa do selector = implementar Story 10.3. QA do Epic 8 deve validar o selector de UI sem exigir o comportamento de troca de produto.
- npm dependencies: none new — reuse `@leedi/agent`, `@leedi/ui`, TanStack Query, `ioredis`.

### Testing standards

- Unit: `process-message` sandbox mode — assert `MetaCloudProvider.sendText` NOT called, segments returned, usage NOT incremented.
- Unit: scenario builder produces correct synthetic lead shape for each of the 3 scenarios.
- No E2E in this story — UI verification via manual testing during playground session.

### Pitfalls to avoid

- Do NOT modify the Agent SDK call itself — `sandboxMode` bypasses only the WhatsApp send and billing side effects, not the Claude API call.
- Do NOT accidentally increment `conversas_usadas` in sandbox mode — the guard must be in the `conversation_window` creation path, not just in the send path.
- Do NOT create real lead rows — a playground session that persists fake leads pollutes the tenant's CRM.
- Redis session TTL must be enforced — uncleaned playground sessions will accumulate memory.

### Project Structure Notes

- Sandbox seam lives in `@leedi/agent` (process-message). Playground route lives in `apps/api`. UI lives in `apps/dashboard`. No new packages needed.

### References

- [Source: docs/01-leedi-arquitetura.md#7.2 Fluxo de uma mensagem]
- [Source: _bmad-output/planning-artifacts/epics.md#Story 8.1: Playground Chat Interface]
- [Source: _bmad-output/implementation-artifacts/7-2-agent-core-processing-loop.md] (process-message — the sandbox seam must not break its contract)
- [Source: _bmad-output/implementation-artifacts/3-1-dashboard-navigation-shell-layout.md] (sidebar nav)
- [Source: _bmad-output/implementation-artifacts/5-5-conversation-window-tracking-24h-billing-unit.md] (billable window creation — skip when sandboxMode)

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
