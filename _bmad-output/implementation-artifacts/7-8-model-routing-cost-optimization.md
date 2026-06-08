---
baseline_commit: 9ea8a05
---

# Story 7.8: Model Routing & Cost Optimization

Status: review

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

- [x] Task 1: Model routing constants (AC: #1–#6)
  - [x] Create `packages/agent/src/config/model-routing.ts`
  - [x] `SALES_MODELS = { sonnet: 'claude-sonnet-4-6', haiku: 'claude-haiku-4-5-20251001', opus: 'claude-opus-4-8' }`
  - [x] `MODEL_PRICING = { sonnet: { input: 3/1_000_000, output: 15/1_000_000 }, haiku: { input: 0.25/1_000_000, output: 1.25/1_000_000 }, opus: { input: 15/1_000_000, output: 75/1_000_000 } }` (USD per token, approximate 2025 pricing — comment that these are estimates)
  - [x] `TASK_MODELS = { tag_classification: 'haiku', handoff_summary: 'haiku', text_improvement: 'haiku', sales_conversation: 'sonnet' }`
  - [x] Helper `modelIdForTask(task)` → `SALES_MODELS[TASK_MODELS[task]]`
  - [x] Export all from `packages/agent/src/index.ts`
- [x] Task 2: Audit + fix all Haiku task calls (AC: #1, #2, #3)
  - [x] `packages/agent/src/tools/adicionar-tag.ts` (Story 7.4): replace the interim hardcoded model with `modelIdForTask('tag_classification')`
  - [x] `packages/agent/src/tools/transferir-humano.ts` (Story 7.6): use `modelIdForTask('handoff_summary')` for the handoff summary
  - [x] `apps/api/src/routes/ai.ts` (Story 6.2 — the actual file; Dev Notes said `routes/ai/improve-text.ts`): use `modelIdForTask('text_improvement')`. `@leedi/agent` IS a dependency of `apps/api`, so imported directly (no mirror)
  - [x] Grep the repo for stray hardcoded `claude-` model strings outside `model-routing.ts` and route them through the map (only test files retain literal ids as independent assertions)
- [x] Task 3: Cost tracking per agent message (AC: #6)
  - [x] In `@leedi/agent-memory`'s `saveMessage`, when `usage` and `modelo` are provided, compute `custo_usd = input * MODEL_PRICING[key].input + output * MODEL_PRICING[key].output`
  - [x] Resolve the pricing key from the enum bucket (sonnet/haiku/opus) the model id belongs to (substring match → unknown id leaves cost null)
  - [x] Persist `tokens_input`, `tokens_output`, `modelo`, `custo_usd` on the `agent_messages` row
  - [x] `MODEL_PRICING` duplicated minimally in `@leedi/agent-memory` (NOT imported from `@leedi/agent` — would create a cycle) with a comment pointing to the source of truth
- [x] Task 4: Model selection in `process-message` (AC: #4, #5)
  - [x] When building the Claude call, `model = SALES_MODELS[agent_config.modelo_ia ?? 'sonnet']` via `resolveSalesModel`
  - [x] Enterprise guard: `modelo_ia='opus'` + non-Enterprise → fall back to `sonnet`. Plan check is an explicit stub (`tenantHasOpusAccess` returns `false`) so Opus is denied until billing wires the lookup
- [x] Task 5: Tests (AC: #1, #2, #6)
  - [x] Unit: `TASK_MODELS` routes `tag_classification` and `handoff_summary` to `'haiku'`; `modelIdForTask` returns `claude-haiku-4-5-20251001`
  - [x] Unit: cost calculation from mocked `usage` tokens produces the expected USD value for each model bucket
  - [x] Unit: `process-message` selects the correct model id from `agent_config.modelo_ia` (mock config + mock Anthropic); opus falls back to sonnet for non-Enterprise

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

claude-opus-4-8 (Fullstack Development Specialist)

### Debug Log References

_none_

### Completion Notes List

- **Single source of truth:** all `claude-*` model id strings now live ONLY in `packages/agent/src/config/model-routing.ts`. A repo grep confirms the sole non-test source occurrence is that file; every other `claude-*` literal is inside a test (intentional independent assertion that the constant equals the expected id — keeping the literal out of production code while not making the test tautological).
- **Bug fixed:** the interim `MODEL_MAP` in `process-message.ts` mapped `haiku → 'claude-haiku-4-5'` (missing the `-20251001` date suffix). Replaced wholesale by `SALES_MODELS`, so the bug is gone and the haiku id is now correct everywhere.
- **AC#1/#2/#3 (Haiku tasks):** `adicionar-tag.ts`, `transferir-humano.ts`, and `apps/api/src/routes/ai.ts` (the improve-text route; Dev Notes referenced `routes/ai/improve-text.ts` but the real file is `routes/ai.ts`) all resolve their model via `modelIdForTask('…')` → `claude-haiku-4-5-20251001`.
- **apps/api import:** `@leedi/agent` is already a dependency of `apps/api`, so `ai.ts` imports `modelIdForTask` directly from the barrel — no mirror/duplicate string. Verified `pnpm --filter @leedi/api test` (33 tests) stays green; the new barrel import pulls the `@leedi/agent` graph into the `ai-improve-text` test for the first time without an import-time regression.
- **AC#4/#5 (sales model + Enterprise guard):** `resolveSalesModel(modeloIa, tenantId)` returns `SALES_MODELS[modeloIa ?? 'sonnet']`, with `tenantHasOpusAccess(tenantId)` as an explicit stub returning `false`. So `modelo_ia='opus'` downgrades to Sonnet today (no silent Opus grant); flipping the stub to a real plan lookup lights up AC#5 with no other change.
- **AC#6 (cost):** `saveMessage` computes `custo_usd = tokens_input * price.input + tokens_output * price.output` when a `modelo` is present (pricing is per-token — no double-divide). Bucket resolved by substring (`haiku`/`sonnet`/`opus`); unknown model → `custo_usd` stays null (no throw). An explicitly-passed `custoUsd` is respected. `MODEL_PRICING` is duplicated minimally in `@leedi/agent-memory` (with a source-of-truth comment) to avoid a `@leedi/agent-memory → @leedi/agent` dependency cycle.
- **Tests:** `pnpm --filter @leedi/agent test` (103 passed) and `pnpm --filter @leedi/agent-memory test` (9 passed) both green; `@leedi/agent` + `@leedi/agent-memory` typecheck clean. The two pre-existing `@leedi/api` typecheck errors (`knowledge-base.ts` `tipo` exactOptionalPropertyTypes; `@leedi/notification` resend `--jsx`) are unrelated to this story's files.

### File List

- `packages/agent/src/config/model-routing.ts` (created — canonical model ids, pricing, task map, `modelIdForTask`)
- `packages/agent/src/config/__tests__/model-routing.test.ts` (created — routing + pricing unit tests)
- `packages/agent/src/index.ts` (modified — export routing constants/types)
- `packages/agent/src/tools/adicionar-tag.ts` (modified — `modelIdForTask('tag_classification')`)
- `packages/agent/src/tools/transferir-humano.ts` (modified — `modelIdForTask('handoff_summary')`)
- `packages/agent/src/use-cases/process-message.ts` (modified — `resolveSalesModel` + `tenantHasOpusAccess` stub; removed buggy `MODEL_MAP`)
- `packages/agent/src/use-cases/__tests__/process-message.test.ts` (modified — model-selection + opus-fallback tests)
- `apps/api/src/routes/ai.ts` (modified — improve-text uses `modelIdForTask('text_improvement')`)
- `packages/agent-memory/src/use-cases/save-message.ts` (modified — cost calc with duplicated `MODEL_PRICING`)
- `packages/agent-memory/src/use-cases/__tests__/save-message.test.ts` (created — cost calc unit tests)

### Change Log

| Date       | Version | Description | Author |
|------------|---------|-------------|--------|
| 2026-06-02 | 0.1     | Implemented Story 7.8 — canonical model-routing config (single source of truth for all `claude-*` ids), routed Haiku tasks (tag/handoff/improve-text), sales-model selection + Enterprise Opus guard stub, per-message cost tracking in `saveMessage`. Fixed the interim `claude-haiku-4-5` id bug. Tests green; status → review. | claude-opus-4-8 |
