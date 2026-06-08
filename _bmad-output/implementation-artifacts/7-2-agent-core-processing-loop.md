---
baseline_commit: 992b842
---

# Story 7.2: Agent Core Processing Loop

Status: review

## Story

As a lead contacting the business via WhatsApp,
I want the AI agent to respond to my messages naturally and intelligently,
so that I receive helpful, personalized responses.

## Acceptance Criteria

1. **Given** a lead sends a message and the agent is active for the tenant, **When** processed by the agent use case, **Then** the Claude Agent SDK is called with: the system prompt (built from `agent_config` + `sales_method` + active product), conversation history from the `agent_thread`, the enabled tools (from `agent_config.tools_habilitadas` plus always-on tools), and the new user message.
2. **Given** the stable system prompt is identical across messages in the same campaign context, **When** the agent processes a message, **Then** the stable system-prompt portion uses the Anthropic prompt cache (`anthropic-beta: prompt-caching-2024-07-31` beta header where required) with `cache_control: { type: 'ephemeral' }` on the last block of the stable prefix.
3. **Given** two messages arrive simultaneously for the same lead (same `tenant_id:phone` combination), **When** the second tries to start processing, **Then** a Redis distributed lock (key `agent_lock:{tenantId}:{leadPhone}`, TTL 5 min) prevents parallel execution and the second waits/retries once before dropping.
4. **Given** the agent generates a response, **When** delivered, **Then** it is split into 2–4 natural message segments (split on double newlines or sentence boundaries above 280 chars), each sent via WhatsApp with a small delay (300–500ms) between segments.
5. **Given** the agent call completes, **When** done, **Then** all agent messages (system, user, assistant, tool_use, tool_result) are persisted to `agent_messages` via the `@leedi/agent-memory` package.
6. **Given** the agent produces a response, **When** persisted, **Then** the WhatsApp message is sent via `@leedi/connection` (`MetaCloudProvider`) and saved to the `messages` table with `autor='agente'`.

## Tasks / Subtasks

- [x] Task 1: `@leedi/agent-memory` package — the ONLY access point to the memory tables (AC: #5)
  - [x] Create `packages/agent-memory/` with `package.json` (`name: "@leedi/agent-memory"`), `tsconfig.json`, `vitest.config.ts`, `src/index.ts`
  - [x] `saveThread(input): AgentThread` — upsert an `agent_threads` record for a lead + conversation window; returns the thread
  - [x] `saveMessage(input)` — insert into `agent_messages`; accepts the Anthropic SDK message format in `content`; accepts optional `tokensInput`/`tokensOutput`/`modelo`/`custoUsd`
  - [x] `getThreadHistory(threadId): AgentMessage[]` — ordered `agent_messages` for a thread, shaped for the Anthropic `messages` array
  - [x] `updateThreadStatus(threadId, status)` — set `ativo|pausado|encerrado`
  - [x] `saveToolCall(input)` — insert into `agent_tool_calls` (tool_name, input, output, duracaoMs, erro)
  - [x] All reads/writes via `withTenant`; export ONLY from `src/index.ts`
  - [x] ISOLATION: this is the only module permitted to import the `agent_threads` / `agent_messages` / `agent_tool_calls` schema. `process-message` imports `@leedi/agent-memory`, never the tables directly.
- [x] Task 2: Core `process-message` use case (AC: #1, #3, #5, #6)
  - [x] Create `packages/agent/src/use-cases/process-message.ts`
  - [x] Imports: `@leedi/agent-memory`, `@leedi/connection`, `@leedi/db` (for `agent_configs`, `leads`, `conversation_windows`; the active campaign/product reads), `@anthropic-ai/sdk`, the Redis client
  - [x] Flow (per §7.2): resolve tenant from connection → load/create `conversation_window` (24h window) → run `should_abort` checks (lead optout / blocked / already bought with nothing left to offer; the inbox-pause check is added in Story 7.6) → load agent context (`agent_config`, active campaign/product, sales method) → load/create thread via `saveThread` → build system prompt → run the Claude tool loop → split + send response → persist
  - [x] Distributed lock: acquire `agent_lock:{tenantId}:{leadPhone}` (Upstash Redis via `@upstash/redis`, `SET NX PX 300000`) before processing; one retry with short backoff if held, then drop; release in a `finally` block
- [x] Task 3: Claude Agent SDK integration — the tool_use loop (AC: #1, #2)
  - [x] In `process-message.ts`, construct an `Anthropic` client from `@anthropic-ai/sdk` using `ANTHROPIC_API_KEY`
  - [x] Build the request: `system` = the stable prefix as an array of text blocks with `cache_control: { type: 'ephemeral' }` on the LAST stable block; `messages` = thread history + new user message; `tools` = the filtered tool definitions (see Task 5); `model` = mapped from `agent_config.modelo_ia` (placeholder mapping; the canonical map lands in Story 7.8)
  - [x] Tool loop pattern:
    1. `client.messages.create({ model, system, messages, tools, max_tokens })` (stream=false)
    2. Persist the assistant message (`saveMessage` role=`assistant`, content = response.content)
    3. If `response.stop_reason === 'tool_use'`: for each `tool_use` block, route to the corresponding tool function, `saveToolCall`, append a `{ role: 'user', content: [{ type: 'tool_result', tool_use_id, content }] }` message, then re-call (go to step 1)
    4. Else (`stop_reason === 'end_turn'`): the assistant text is the final answer — exit the loop
  - [x] Guard the loop with a max-iterations cap (e.g. 8) to prevent runaway tool cycles
  - [x] Capture `response.usage` for token accounting (cost calc canonicalized in 7.8)
- [x] Task 4: Response splitting (AC: #4)
  - [x] Create `packages/agent/src/utils/split-response.ts`
  - [x] If text ≤ 280 chars → single segment. Else split on double newlines; if none, split on `. ` boundaries preserving context
  - [x] Max 4 segments; each segment min 40 chars (merge tiny tail segments)
  - [x] Returns `string[]`
- [x] Task 5: Tool registry + toggle filtering (AC: #1) — the integration point for Stories 7.3–7.6
  - [x] Create `packages/agent/src/tools/registry.ts`
  - [x] Define the 10 tool JSON Schemas (Anthropic `tools` format). Always-on: `buscar_historico_lead`, `consultar_ofertas_ativas`, `verificar_elegibilidade`, `enviar_link_checkout`, `marcar_intencao_compra`. Configurable: `consultar_base_conhecimento`, `agendar_followup`, `transferir_humano`, `adicionar_tag`, `solicitar_reengajamento`
  - [x] `buildToolList(toolsHabilitadas)` → always-on tools + configurable tools whose toggle is `true`
  - [x] `routeToolCall(name, input, ctx)` → dispatch to the use case in `packages/agent/src/tools/<name>.ts`. Each tool's implementation ships in its own story (7.3/7.4/7.5/7.6); in THIS story stub not-yet-implemented tools (`agendar_followup`, `solicitar_reengajamento`) with a **GRACEFUL no-op** — do NOT throw. Return `{ scheduled: false, reason: 'feature_not_yet_enabled' }` so the agent loop continues without crashing. These tools are toggled OFF by default (see `tools_habilitadas` defaults in 7.1), so Claude won't call them unless a tenant explicitly enables them. The graceful no-op prevents a crash if they are ever called prematurely.
  - [x] CRITICAL — schema vs. ctx boundary: the Anthropic tool JSON Schemas expose ONLY model-supplied parameters (e.g. `productId`, `categoria`, `tipo`, `motivo`, `conversationSummary`). Tenant/identity/transport fields (`tenantId`, `leadId`, `leadPhone`, `connectionId`, `threadId`, `conversationWindowId`) are NEVER in the schema Claude sees — `routeToolCall` injects them from `ctx`. This applies to ALL tool stories (7.3/7.4/7.5/7.6): where a tool's "Input" lists those fields, they come from `ctx`, not from Claude
  - [x] Stories 7.3–7.6 add their tool implementations and wire them into `routeToolCall` here — they do NOT define a separate router
- [x] Task 6: Per-tenant API rate limiting middleware — NFR8 (AC: implicit)
  - [x] Add `@upstash/ratelimit` as a dependency of `apps/api` (already uses Upstash Redis via `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN`)
  - [x] Create `apps/api/src/middleware/rate-limit.ts` using sliding window: `Ratelimit.slidingWindow(100, '1 m')` per `tenant:{tenantId}` key
  - [x] Apply the middleware to all tenant-scoped routes (after `requireTenantSession`, before route handlers); skip for unauthenticated routes and webhook endpoints (Meta/Hotmart have their own validation)
  - [x] On rate limit exceeded, return `429 Too Many Requests` with `{ error: 'Rate limit exceeded. Try again in a moment.' }`
  - [x] Webhook endpoints (`/webhook/meta`, `/webhook/hotmart`) use a separate, higher limit (`Ratelimit.slidingWindow(1000, '1 m')` per `webhook:{connectionId}`) — bursts are normal for Meta/Hotmart
- [x] Task 7: Wire into the webhook handler (AC: #6)
  - [x] After the Redis debounce (~6s) resolves, invoke `process-message`. In this codebase the debounce resolves in the QStash-triggered `POST /api/internal/agent-flush` handler (`apps/api/src/routes/internal.ts`), NOT inline in the webhook — see Dev Notes. That handler is where `processMessage` runs.
  - [x] Acknowledge `200` to Meta immediately; process asynchronously. The webhook (`webhook-meta.ts`) already acks 200 and schedules the QStash flush; the agent loop runs in the separate QStash request, so it never blocks the ack. `agent-flush` `captureException`s and rethrows (5xx) so QStash retries.
  - [x] On agent success, send each segment via `MetaCloudProvider.sendText()` and persist each to `messages` with `autor='agente'`
- [x] Task 8: Tests (AC: #1, #3, #4, #5)
  - [x] Unit: `buildSystemPrompt` output is caching-ready (stable prefix is the cache boundary) — assert the cached block placement
  - [x] Unit: `split-response` for ≤280, >280 with double newlines, >280 without, and the min-40/max-4 rules
  - [x] Unit: `process-message` calls `saveThread`/`saveMessage` (mock `@leedi/agent-memory`); the distributed lock prevents parallel execution (mock Redis: second call sees the held key)
  - [x] Unit: the tool loop re-calls on `stop_reason: 'tool_use'` and exits on `end_turn` (mock Anthropic client returning a tool_use then an end_turn)
  - [x] Integration: full message flow with mocked Claude API + mocked Meta sending — assert segments sent and `messages`/`agent_messages` rows written

## Dev Notes

- Files to create: `packages/agent-memory/` (new package: `package.json`, `tsconfig.json`, `vitest.config.ts`, `src/index.ts`), `packages/agent/src/use-cases/process-message.ts`, `packages/agent/src/utils/split-response.ts`, `packages/agent/src/tools/registry.ts`.
- Files to modify: `apps/api/src/routes/webhook/meta.ts` (invoke `process-message` after debounce), `packages/agent/src/index.ts` (export `processMessage`), `packages/config/src/schema.ts` (add `ANTHROPIC_API_KEY`, required), Redis client wiring.
- npm dependencies: `@anthropic-ai/sdk` (in `@leedi/agent`); `ioredis` if not already present (shared Redis client). No axios.

### Claude SDK usage pattern (tool_use loop) — MANDATORY structure

```
const client = new Anthropic({ apiKey });
let messages = [...threadHistory, { role: 'user', content: userContent }];
for (let i = 0; i < MAX_ITERS; i++) {
  const res = await client.messages.create({ model, system, tools, messages, max_tokens });
  await saveMessage({ role: 'assistant', content: res.content, usage: res.usage });
  if (res.stop_reason !== 'tool_use') return finalText(res); // end_turn → done
  messages.push({ role: 'assistant', content: res.content });
  const toolResults = await Promise.all(res.content
    .filter(b => b.type === 'tool_use')
    .map(async (b) => {
      const out = await routeToolCall(b.name, b.input, ctx);
      await saveToolCall({ toolName: b.name, input: b.input, output: out });
      return { type: 'tool_result', tool_use_id: b.id, content: JSON.stringify(out) };
    }));
  messages.push({ role: 'user', content: toolResults });
}
```

### Prompt caching structure (§7.5) — MANDATORY

- The system prompt is split: STABLE prefix (persona + method + product + limits, from `buildSystemPrompt`) and never changes during a campaign; VARIABLE suffix (the new lead message) is non-cached.
- Pass `system` as an array of blocks and attach `cache_control: { type: 'ephemeral' }` to the LAST block of the stable prefix so Anthropic caches everything up to and including it.
- The new user message goes in `messages`, after the cache boundary — never inside the cached prefix.
- Include the `anthropic-beta: prompt-caching-2024-07-31` header if the installed SDK version requires it (newer SDKs enable caching without the beta header — verify the SDK version at impl time).

### @leedi/agent-memory isolation principle — MANDATORY

- `agent_threads`, `agent_messages`, `agent_tool_calls` are touched ONLY by `@leedi/agent-memory`. No other module imports their schema.
- `@leedi/agent` (orchestration, tools, prompt builder) is a SEPARATE package from `@leedi/agent-memory` (isolated DB access). `process-message` imports the memory package's functions, never the memory tables.

### Testing standards

- Unit tests mock the Anthropic client, Redis, `@leedi/agent-memory`, and `@leedi/connection`. Assert loop behavior, lock behavior, and split output deterministically.
- Integration tests run the flow end to end with mocked external calls against local Supabase.

### Pitfalls to avoid

- Do NOT block the Meta webhook ack on the agent loop — ack 200 first, process async (Meta retries on slow/failed acks → duplicate processing).
- Do NOT release the distributed lock outside `finally` — a thrown error mid-loop must still release it.
- Do NOT place the new user message inside the cached prefix — it kills the cache hit every turn.
- Do NOT import the memory tables directly from `process-message` — go through `@leedi/agent-memory`.
- Do NOT let the tool loop run unbounded — cap iterations.
- Do NOT define per-story tool routers — there is ONE registry (`registry.ts`); tool stories wire into it.

### Project Structure Notes

- Two distinct packages: `@leedi/agent` (process-message, tools, utils, registry) and `@leedi/agent-memory` (thread/message/tool-call persistence). The webhook route in `apps/api` is the only caller of `process-message`.

### References

- [Source: docs/01-leedi-arquitetura.md#7.2 Fluxo de uma mensagem]
- [Source: docs/01-leedi-arquitetura.md#7.5 Prompt caching]
- [Source: docs/01-leedi-arquitetura.md#6.5 Domínio Agent + Agent Memory]
- [Source: _bmad-output/planning-artifacts/epics.md#Story 7.2: Agent Core Processing Loop]
- [Source: _bmad-output/implementation-artifacts/4-4-inbound-webhook-message-reception-routing.md] (webhook debounce + ack pattern)
- [Source: _bmad-output/implementation-artifacts/4-5-outbound-message-sending-via-meta-cloud-api.md] (MetaCloudProvider.sendText)
- [Source: _bmad-output/implementation-artifacts/7-1-agent-configuration-panel.md] (agent_config + buildSystemPrompt)

## Dev Agent Record

### Agent Model Used

claude-opus-4-8 (Fullstack Development Specialist)

### Debug Log References

_none_

### Completion Notes List

- **`@leedi/agent-memory` is the sole owner of the memory tables.** `saveThread` / `saveMessage` /
  `getThreadHistory` / `updateThreadStatus` / `saveToolCall` (+ `closeStaleThreads`) all run through
  `withTenant` and are the ONLY code that touches `agent_threads` / `agent_messages` /
  `agent_tool_calls`. `process-message` imports the package's functions, never the tables. The package
  is a separate workspace package from `@leedi/agent`.
- **`getThreadHistory` role mapping is load-bearing.** The persisted `system` row is audit-only and is
  filtered out (the system prompt is rebuilt per request and passed in the `system` param); the
  persisted `tool` role maps to `{ role: 'user', content: [...tool_result] }`. The Anthropic
  `messages` array only accepts user/assistant — emitting `system`/`tool` verbatim would 400.
- **Prompt caching (AC#2) — no beta header needed.** Verified `@anthropic-ai/sdk@0.100.1`: prompt
  caching with `cache_control: { type: 'ephemeral' }` is GA and does NOT require the
  `anthropic-beta: prompt-caching-…` header (the header referenced in AC#2 is stale). The entire
  `buildSystemPrompt` output is per-message-stable, so it's wrapped in a single `system` text block
  with one cache breakpoint. The variable lead message goes in `messages`, never in `system`. Tool
  list order is deterministic (always-on first, then configurable in declaration order) so the
  `tools` prefix is byte-stable and cacheable too.
- **Model map is a placeholder (canonical map lands in 7.8):** `sonnet → claude-sonnet-4-6`,
  `haiku → claude-haiku-4-5`, `opus → claude-opus-4-8` (current model IDs verified via the claude-api
  skill).
- **Distributed lock (AC#3):** `agent_lock:{tenantId}:{leadPhone}` via `@upstash/redis`
  `set(key, token, { nx: true, px: 300000 })`. One retry after a short backoff, then drops with
  `{ status: 'locked' }`. A UNIQUE token is stored as the value and the `finally` release only deletes
  the key when `get(key) === token` — a caller that fails to acquire never deletes the holder's lock.
- **Redis client decision:** the story Dev Notes mention `ioredis`, but the monorepo standardizes on
  `@upstash/redis` (REST) — it's already a dep of `apps/api` and used by `webhook-meta.ts` /
  `internal.ts`. Used `@upstash/redis` for both the lock and the rate limiter. No `ioredis` added.
- **Wiring point (Task 7):** the story text says "in `webhook/meta.ts` after the debounce resolves",
  but in this codebase the debounce does NOT resolve inline — `webhook-meta.ts` buffers the message and
  schedules a QStash job that calls `POST /api/internal/agent-flush` ~6s later. That handler (which had
  the literal `TODO(Epic 7)`) is where `processMessage` now runs. Consequence: the "ack 200 first,
  process async" requirement is satisfied structurally (the agent loop runs in the QStash-triggered
  request, not the Meta request) — no detached promise was added to the webhook. `webhook-meta.ts` was
  edited only to pass `leadId` / `connectionId` / `conversationWindowId` in the QStash body so the
  agent loop does NOT re-resolve the conversation window (re-calling `resolveConversationWindow` would
  double-bump `message_count`).
- **`process-message` uses dependency injection** (`redis`, `anthropic`, optional `senderFactory` /
  `sleep`) so the loop, the lock, and the WhatsApp sender are all mockable — matching the existing
  `WebhookDeps` / `healthFactory` / `nowFn` patterns in the codebase.
- **Tool registry (Task 5):** all 10 tool JSON Schemas expose ONLY model-supplied params; identity /
  transport fields come from `ToolContext`, never the schema. `routeToolCall` gracefully stubs
  `agendar_followup` / `solicitar_reengajamento` with `{ scheduled: false, reason: 'feature_not_yet_enabled' }`
  and returns a structured `{ ok: false, reason: 'tool_not_implemented' }` for the others (never throws)
  — Stories 7.3–7.6 replace those branches.
- **Rate limiting (Task 6) — applied to ALL tenant-scoped routers + the webhook.** `rateLimitTenant()`
  (sliding 100/min) is mounted router-level as `router.use('*', rateLimitTenant())` on every
  tenant-scoped router: `agent/config.ts`, `whatsapp.ts`, `leads.ts`, `knowledge/products.ts`,
  `knowledge/knowledge-base.ts`. It keys off the `:tenantId` path param (falling back to
  `resolvedTenantId`), so it works regardless of where `requireTenantSession` runs in the chain. The
  Meta webhook uses the higher `webhookLimit(phoneNumberId)` (1000/min, keyed ≈ connection) — checked
  inline after signature verification because the raw body can only be read once. Two safety
  properties: (1) the limiter **fails open** (`safeLimit` try/catch) so an Upstash outage never 500s a
  request; (2) it short-circuits to "allow" under non-production env with the `test.upstash.io`
  placeholder host, so route unit tests (which mock `@leedi/config` with that host) don't make live
  Upstash calls. The middleware accepts an injected `RateLimiter` for explicit unit testing.
- **`agent-flush` drains + DELs the debounce buffer BEFORE calling `processMessage`** (idempotency
  guard for QStash retries). In the rare case `processMessage` returns `{ status: 'locked' }` (lost the
  distributed lock), the drained messages are already gone. This is intentional and narrow: a second
  same-lead flush normally finds an empty buffer and returns before ever calling `processMessage`, so
  real lock contention at this point is rare. Noted for the next dev.
- **Verification:** `@leedi/agent` 34 tests pass; `@leedi/agent-memory` 3 tests pass; `@leedi/api`
  33 tests pass (27 pre-existing + 6 new `rate-limit.test.ts`). `typecheck` + `lint` clean on
  `@leedi/agent`, `@leedi/agent-memory`, and `@leedi/api` (the two `@leedi/api` `typecheck` errors in
  `knowledge-base.ts` and `notification/resend.ts` are PRE-EXISTING and in files this story did not
  touch). While editing `webhook-meta.ts` for the QStash body, also removed 3 pre-existing dead
  bindings (`withTenant` import + two unused `redis`/`qstash` destructures) so the file lints clean.
- **Not started by the dev server / not committed** per the task instructions — tests only.

### File List

**Created:**
- `packages/agent-memory/vitest.config.ts`
- `packages/agent-memory/src/types.ts`
- `packages/agent-memory/src/use-cases/save-thread.ts`
- `packages/agent-memory/src/use-cases/save-message.ts`
- `packages/agent-memory/src/use-cases/get-thread-history.ts`
- `packages/agent-memory/src/use-cases/update-thread-status.ts`
- `packages/agent-memory/src/use-cases/save-tool-call.ts`
- `packages/agent-memory/src/use-cases/__tests__/get-thread-history.test.ts`
- `packages/agent/src/utils/split-response.ts`
- `packages/agent/src/tools/types.ts`
- `packages/agent/src/tools/registry.ts`
- `packages/agent/src/use-cases/process-message.ts`
- `packages/agent/src/utils/__tests__/split-response.test.ts`
- `packages/agent/src/utils/__tests__/system-prompt-cache.test.ts`
- `packages/agent/src/tools/__tests__/registry.test.ts`
- `packages/agent/src/use-cases/__tests__/process-message.test.ts`
- `apps/api/src/middleware/rate-limit.ts`
- `apps/api/src/__tests__/rate-limit.test.ts`

**Modified:**
- `packages/agent-memory/package.json` (add `@leedi/db` dep, `vitest`, `test` script)
- `packages/agent-memory/src/index.ts` (barrel exports)
- `packages/agent/package.json` (add `@anthropic-ai/sdk`, `@leedi/agent-memory`, `@leedi/connection`, `@leedi/db` deps)
- `packages/agent/src/index.ts` (export `splitResponse`, `buildToolList`, `routeToolCall`, `processMessage` + types)
- `apps/api/package.json` (add `@leedi/agent`, `@leedi/agent-memory`, `@upstash/ratelimit` deps)
- `apps/api/src/routes/internal.ts` (`agent-flush` now drains the buffer and runs `processMessage`)
- `apps/api/src/routes/webhook-meta.ts` (QStash body carries `leadId`/`connectionId`/`conversationWindowId`; inline `webhookLimit` after signature verify; removed pre-existing dead bindings)
- `apps/api/src/routes/agent/config.ts` (router-level `rateLimitTenant()`)
- `apps/api/src/routes/whatsapp.ts` (router-level `rateLimitTenant()`)
- `apps/api/src/routes/leads.ts` (router-level `rateLimitTenant()`)
- `apps/api/src/routes/knowledge/products.ts` (router-level `rateLimitTenant()`)
- `apps/api/src/routes/knowledge/knowledge-base.ts` (router-level `rateLimitTenant()`)

### Change Log

| Date       | Version | Description                                                                                   | Author |
| ---------- | ------- | --------------------------------------------------------------------------------------------- | ------ |
| 2026-06-01 | 0.1     | Implemented agent core processing loop: `@leedi/agent-memory` package, `process-message` tool loop with prompt caching + distributed lock, response splitting, tool registry, rate-limit middleware, and `agent-flush` wiring. Tests green; status → review. | claude-opus-4-8 |
