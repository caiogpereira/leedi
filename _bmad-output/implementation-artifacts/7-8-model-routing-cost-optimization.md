---
baseline_commit: 9ea8a05
---

# Story 7.8: Model Routing & Cost Optimization

Status: ready-for-dev

## Story

As a developer,
I want non-sales AI tasks to use Haiku instead of Sonnet,
so that AI costs stay within the sustainable margin.

## Acceptance Criteria

1. **Given** the agent calls `adicionar_tag` and needs to classify a tag, **When** the classification model is invoked, **Then** it uses `claude-haiku-4-5-20251001` (not Sonnet).
2. **Given** `transferir_humano` generates a handoff summary, **When** the summary is generated, **Then** it uses `claude-haiku-4-5-20251001`.
3. **Given** the AI improvement button (✨) generates a text suggestion, **When** the improve-text endpoint is called, **Then** it uses `claude-haiku-4-5-20251001`.
4. **Given** a sales conversation message is processed by the main agent loop, **When** the model is selected, **Then** it uses `claude-sonnet-4-6` (or the value of `agent_config.modelo_ia` mapped to the correct model id).
5. **Given** an Enterprise tenant has `modelo_ia: 'opus'` in their `agent_config`, **When** the agent processes a message, **Then** it uses `claude-opus-4-8` for the sales conversation.
6. **Given** AI cost data is available (`tokens_input`, `tokens_output`, `custo_usd` in `agent_messages`), **When** persisted, **Then** cost is calculated: `input_tokens * model_input_price + output_tokens * model_output_price` (using approximate pricing constants in config).

## Tasks / Subtasks

- [ ] Task 1: Model routing constants (AC: #1–#6)
  - [ ] Create `packages/agent/src/config/model-routing.ts`
  - [ ] `SALES_MODELS = { sonnet: 'claude-sonnet-4-6', haiku: 'claude-haiku-4-5-20251001', opus: 'claude-opus-4-8' }`
  - [ ] `MODEL_PRICING = { sonnet: { input: 3/1_000_000, output: 15/1_000_000 }, haiku: { input: 0.25/1_000_000, output: 1.25/1_000_000 }, opus: { input: 15/1_000_000, output: 75/1_000_000 } }` (USD per token, approximate 2025 pricing — comment that these are estimates)
  - [ ] `TASK_MODELS = { tag_classification: 'haiku', handoff_summary: 'haiku', text_improvement: 'haiku', sales_conversation: 'sonnet' }`
  - [ ] Helper `modelIdForTask(task)` → `SALES_MODELS[TASK_MODELS[task]]`
  - [ ] Export all from `packages/agent/src/index.ts`
- [ ] Task 2: Audit + fix all Haiku task calls (AC: #1, #2, #3)
  - [ ] `packages/agent/src/tools/adicionar-tag.ts` (Story 7.4): replace the interim hardcoded model with `modelIdForTask('tag_classification')`
  - [ ] `packages/agent/src/tools/transferir-humano.ts` (Story 7.6): use `modelIdForTask('handoff_summary')` for the handoff summary
  - [ ] `apps/api/src/routes/ai/improve-text.ts` (Story 6.2): use `modelIdForTask('text_improvement')` — replace any hardcoded string. If `@leedi/agent` is not importable from `apps/api`, mirror the constant or expose a thin export
  - [ ] Grep the repo for stray hardcoded `claude-` model strings outside `model-routing.ts` and route them through the map
- [ ] Task 3: Cost tracking per agent message (AC: #6)
  - [ ] In `@leedi/agent-memory`'s `saveMessage` (Story 7.2 / `packages/agent-memory/src/...`), when `usage` and `modelo` are provided, compute `custo_usd = usage.input_tokens * MODEL_PRICING[key].input + usage.output_tokens * MODEL_PRICING[key].output`
  - [ ] Resolve the pricing key from the enum bucket (sonnet/haiku/opus) the model id belongs to
  - [ ] Persist `tokens_input`, `tokens_output`, `modelo`, `custo_usd` on the `agent_messages` row
  - [ ] Note: this keeps cost math near the memory write; `MODEL_PRICING` may be re-exported from `@leedi/agent` or duplicated minimally in `@leedi/agent-memory` to preserve package isolation — prefer importing from `@leedi/agent` if the dependency direction allows, else duplicate the constant with a comment
- [ ] Task 4: Model selection in `process-message` (AC: #4, #5)
  - [ ] When building the Claude call (Story 7.2 Task 3), set `model = SALES_MODELS[agent_config.modelo_ia ?? 'sonnet']`
  - [ ] Enterprise guard: if `modelo_ia='opus'` but the tenant plan is not Enterprise, fall back to `sonnet`. The plan check may be a TODO/stub for now — ensure the mapping + guard hook exist so billing wiring is a one-line change later
- [ ] Task 5: Tests (AC: #1, #2, #6)
  - [ ] Unit: `TASK_MODELS` routes `tag_classification` and `handoff_summary` to `'haiku'`; `modelIdForTask` returns `claude-haiku-4-5-20251001`
  - [ ] Unit: cost calculation from mocked `usage` tokens produces the expected USD value for each model bucket
  - [ ] Unit: `process-message` selects the correct model id from `agent_config.modelo_ia` (mock config + mock Anthropic); opus falls back to sonnet for non-Enterprise

## Dev Notes

- Files to create: `packages/agent/src/config/model-routing.ts`.
- Files to modify: `packages/agent/src/tools/adicionar-tag.ts`, `packages/agent/src/tools/transferir-humano.ts`, `apps/api/src/routes/ai/improve-text.ts`, `packages/agent-memory/src/...` (`saveMessage` cost calc), `packages/agent/src/use-cases/process-message.ts` (model selection + Enterprise guard), `packages/agent/src/index.ts` (export routing constants).
- npm dependencies: none new.
- This story is the canonical home for ALL model id strings. The exact ids — `claude-sonnet-4-6`, `claude-haiku-4-5-20251001`, `claude-opus-4-8` — live ONLY in `model-routing.ts`. Earlier stories (7.2/7.4/7.6) used interim hardcodes; this story removes them.
- Pricing constants are approximate — comment them clearly and centralize so a price change is one edit. They drive `agent_messages.custo_usd`, which feeds usage/billing dashboards later.
- @leedi/agent-memory isolation: cost is computed at the memory-write boundary; keep the package's only DB surface intact. If importing `MODEL_PRICING` from `@leedi/agent` would create a cycle, duplicate the small constant rather than breaking isolation.

### Testing standards

- Pure unit tests — routing and cost math are deterministic. Mock the Anthropic client for the `process-message` model-selection test.

### Pitfalls to avoid

- Do NOT scatter model id strings across files — one source of truth in `model-routing.ts`.
- Do NOT use Sonnet (or Opus) for tag classification, handoff summaries, or text improvement — Haiku only (the entire point of this story / NFR cost margin).
- Do NOT silently grant Opus to non-Enterprise tenants — fall back to Sonnet; leave the plan check as an explicit stub, not a missing branch.
- Pricing is per-token in the constants (already divided by 1e6) — do NOT double-divide when computing `custo_usd`.
- Keep package isolation: don't make `@leedi/agent-memory` depend on heavy parts of `@leedi/agent` just to read pricing.

### Project Structure Notes

- Routing/pricing constants live in `packages/agent/src/config/`. Consumers are the tools, `process-message`, `@leedi/agent-memory` (cost), and the `improve-text` API route.

### References

- [Source: docs/01-leedi-arquitetura.md#7.4 Roteamento de modelos]
- [Source: docs/01-leedi-arquitetura.md#7.5 Prompt caching]
- [Source: _bmad-output/planning-artifacts/epics.md#Story 7.8: Model Routing & Cost Optimization]
- [Source: _bmad-output/implementation-artifacts/7-2-agent-core-processing-loop.md] (process-message model selection)
- [Source: _bmad-output/implementation-artifacts/7-4-sales-conversion-tools-checkout-intent-tagging.md] (adicionar_tag Haiku)
- [Source: _bmad-output/implementation-artifacts/7-6-human-transfer-tool.md] (handoff summary Haiku)

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
