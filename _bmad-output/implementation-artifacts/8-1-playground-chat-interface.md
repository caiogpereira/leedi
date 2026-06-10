---
baseline_commit: 992b842
---

# Story 8.1: Playground Chat Interface

Status: done

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

- [x] Task 1: Sandbox seam in `process-message` (AC: #2, #3, #4)
  - [x] Add `sandboxMode?: boolean` to the `ProcessMessageContext` interface in `packages/agent/src/use-cases/process-message.ts`
  - [x] When `sandboxMode: true`: skip the `MetaCloudProvider.sendText()` call; instead collect all segment strings and return them as `{ segments: string[], toolCalls: ToolCallLog[] }` to the caller
  - [x] When `sandboxMode: true`: skip billable `conversation_window` creation; use a transient in-memory thread (or create `agent_threads` row with `sandboxMode: true` flag if persistence is needed for multi-turn) — ensure `usage_counters` is NEVER incremented
  - [x] ~~When `sandboxMode: true`: still persist `agent_messages` and `agent_tool_calls`~~ — **superseded by the implementation's design decision (see Dev Agent Record):** sandbox is Redis-only with NO `agent_threads`/`agent_messages`/`agent_tool_calls` writes. Tool transparency (Story 8.2) is served by the `ToolCallLog[]` returned in the API response, not a DB read. This avoids synthetic rows polluting real tables (Story 8.2 pitfall).
  - [x] Add a `ToolCallLog` type: `{ toolName: string; input: unknown; output: unknown }` returned in `processMessage` result when `sandboxMode: true`
  - [x] Unit test: `process-message` with `sandboxMode: true` does NOT call `MetaCloudProvider.sendText()` (verify with mock)
  - [x] Unit test: `usage_counters` increment is NOT triggered when `sandboxMode: true`
- [x] Task 2: Playground API endpoint (AC: #2, #6)
  - [x] Create `apps/api/src/routes/playground/index.ts` (Hono router)
  - [x] `POST /playground/message` — accepts `{ message: string; campaignId?: string; scenario: 'novo_lead' | 'lead_recorrente' | 'lead_com_objecao'; sessionId?: string }` — validates with Zod — invokes `process-message` with `sandboxMode: true` — returns `{ sessionId, segments: string[], toolCalls: ToolCallLog[] }`
  - [x] `DELETE /playground/session/:sessionId` — clears the in-memory/transient session to reset the conversation
  - [x] Use a transient playground identity: a synthetic `lead` object built from the selected scenario (do NOT create real leads rows for playground sessions)
  - [x] Register the router in `apps/api/src/app.ts` behind the `operator` RBAC guard
- [x] Task 3: Playground UI page (AC: #1, #5, #6)
  - [x] Create `apps/dashboard/app/(shell)/agente/playground/page.tsx`
  - [x] Header controls: campaign selector (shows "Sem campanha ativa" — awaiting Story 10.3) + scenario selector (radio/select)
  - [x] Chat area: scrollable message list, WhatsApp-style bubbles (lead = left/gray, agent = right/indigo), multi-segment renders as sequential bubbles
  - [x] Input area: textarea (single-line Enter send, Shift+Enter newline), send button with loading state
  - [x] "Reiniciar conversa" button calls `DELETE /playground/session/:id` and resets local state
  - [x] Optimistic message display: show the operator's message immediately before the response arrives
  - [x] Plain fetch mutation for `POST /playground/message`; handle loading and error states
- [x] Task 4: Sidebar navigation link (AC: #1)
  - [x] Add "Playground" link to the Agente section in sidebar (`apps/dashboard/components/shell/Sidebar.tsx`)
  - [x] RBAC: visible to `owner`, `admin`, `operator`; hidden from `viewer`

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

claude-sonnet-4-6

### Debug Log References

- Design decision: Redis-only persistence in sandbox (no agent_threads/agent_messages/agent_tool_calls writes). Resolves conflict between 8.1 "persist tool calls" and 8.2 "no synthetic history in DB". ToolCallLog[] returned in API response.
- Design decision: sandbox guard added to `routeToolCall` for write-side tools (enviar_link_checkout, marcar_intencao_compra, adicionar_tag, transferir_humano) to prevent real side-effects.
- Design decision: distributed lock skipped in sandbox path (rapid multi-turn sends would hit 5-min TTL).

### Completion Notes List

- Added `sandboxMode?: boolean` + `seedHistory?: AnthropicHistoryMessage[]` to `ProcessMessageInput`
- Added `ToolCallLog` interface and `{ status: 'sandbox'; segments; toolCalls }` variant to `ProcessMessageResult`
- `runSandboxMessage()` new function in process-message.ts: skips lock, DB writes, and send loop
- `runToolLoop` return type changed to `{ text: string; toolCalls: ToolCallLog[] }` (backward-compat)
- `sandboxMode?: boolean` added to `ToolContext`; write-side tools stubbed in `routeToolCall`
- Playground API: `POST /api/tenants/:tenantId/playground/message` + `DELETE /session/:sessionId`
- Redis session TTL 30min; lazy singleton init (avoids connection at import time for tests)
- Dashboard: `PlaygroundClient` component with WhatsApp-style bubbles, scenario selector, reset button
- Sidebar: "Playground" link with FlaskConical icon
- 8 unit tests added (sandbox mode coverage)

### File List

- packages/agent/src/use-cases/process-message.ts (modified)
- packages/agent/src/use-cases/__tests__/process-message.test.ts (modified)
- packages/agent/src/tools/types.ts (modified)
- packages/agent/src/tools/registry.ts (modified)
- packages/agent/src/index.ts (modified)
- apps/api/src/routes/playground/index.ts (created)
- apps/api/src/routes/playground/scenarios.ts (created)
- apps/api/src/routes/playground/__tests__/scenarios.test.ts (created)
- apps/api/src/app.ts (modified)
- apps/dashboard/app/(shell)/agente/playground/page.tsx (created)
- apps/dashboard/app/(shell)/agente/playground/playground-client.tsx (created)
- apps/dashboard/app/(shell)/agente/playground/_components/ToolCallPanel.tsx (created)
- apps/dashboard/components/shell/Sidebar.tsx (modified)
- apps/dashboard/messages/pt-BR.json (modified)

### Change Log

- feat(sandbox): add sandboxMode seam to process-message (Story 8.1)
- feat(playground): Hono API router with Redis session storage
- feat(playground-ui): chat interface with WhatsApp-style bubbles and scenario selector
- fix(playground): use a valid sentinel UUID for sandbox lead/connection/window ids (review)
- fix(agent): skip lead_journey_events write in sandbox consultar_base_conhecimento (review)
- feat(playground-ui): render disabled "Sem campanha ativa" campaign selector (AC#1a, review)

## Senior Developer Review (AI) — 2026-06-10

**Reviewer:** Caio (via bmad-code-review). **Outcome:** Approved with fixes applied. Status → **done**.

### Findings & resolutions

1. **[HIGH — fixed] Playground 500s on every message (non-UUID id → Postgres `22P02`).**
   The API route passed `leadId: 'playground-lead'`, `connectionId: 'sandbox'`,
   `conversationWindowId: 'sandbox-window'`. The sandbox path calls
   `loadAgentContext(tenantId, leadId)` → `WHERE leads.id = 'playground-lead'`, and `leads.id`
   is a `uuid` column. Reproduced directly against the live DB:
   `ERROR: 22P02: invalid input syntax for type uuid: "playground-lead"`. The route has no
   try/catch, so this surfaces as a 500 on the first message. The unit tests mock `@leedi/db`,
   so they were green while the feature was broken (same blind-spot class as prior epics).
   **Fix:** replaced the three uuid-typed placeholders with a nil sentinel UUID
   (`00000000-0000-0000-0000-000000000000`) — valid syntax, matches no row, lead falls back to
   the synthetic default. Verified: `SELECT … WHERE id = '0000…'` → `0` rows, no error.
   Files: `apps/api/src/routes/playground/index.ts`.

2. **[HIGH — fixed] Sandbox was NOT side-effect-free: `consultar_base_conhecimento` wrote a real
   `lead_journey_events` row.** That tool is configurable (not in `SANDBOX_STUBS`) and, on a
   matched objection, inserts a journey event keyed by `ctx.leadId`. The `lead_com_objecao`
   scenario triggers it on turn one. With the nil-UUID lead this would hit the FK
   `lead_journey_events.lead_id → leads` (confirmed present) and throw; in any case it breaches
   the Story 8.1 sandbox guarantee and the Story 8.2 pitfall ("do NOT write synthetic history to
   real tables"). **Fix:** `consultarBaseConhecimento` now takes `sandboxMode` and skips the
   insert in sandbox while still returning entries (transparency intact). Regression test added.
   Files: `packages/agent/src/tools/consultar-base-conhecimento.ts` (+ test).

3. **[MEDIUM — fixed] AC#1(a) campaign selector was checked `[x]` but not rendered.** Neither
   `page.tsx` nor `playground-client.tsx` had a campaign dropdown. **Fix:** added a disabled
   "Sem campanha ativa" `<select>` (campaign-aware behavior remains Story 10.3).
   Files: `apps/dashboard/app/(shell)/agente/playground/playground-client.tsx`.

4. **[LOW — noted, not changed] Stale `baseline_commit: 992b842`** (end of Epic 2). Epics 7–20
   landed in one checkpoint (`a6b9844`) and the hashes were deliberately re-set after a
   git-history secret purge (`460a15c`), so there is no clean per-story baseline to point at.
   Left as-is intentionally rather than fabricate a hash. Review scoped via the story File Lists.

### Verification

- `@leedi/agent` typecheck clean; tests **120/120** (was 119; +1 sandbox-guard regression test).
- `apps/api` playground tests **4/4**; no new `tsc` errors (the 2 remaining `jobs/` errors are
  Epic 16/campaigns, out of scope).
- `@leedi/dashboard` typecheck: no playground errors (2 remaining errors are Epics 9 & 18).
- The uuid fix is proven at the DB level, but a full end-to-end playground run (live Anthropic +
  Redis + a real `agent_config`) was **not** executed this session → tracked as **PL-16**.
