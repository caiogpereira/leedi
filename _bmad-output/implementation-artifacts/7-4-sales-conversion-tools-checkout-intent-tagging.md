---
baseline_commit: 992b842
---

# Story 7.4: Sales & Conversion Tools (Checkout, Intent, Tagging)

Status: done

## Story

As a tenant owner,
I want the agent to send checkout links, mark purchase intent, and auto-tag leads,
so that warm leads get frictionless purchase paths and CRM data stays current.

## Acceptance Criteria

1. **Given** a lead expresses interest in buying, **When** the agent calls `enviar_link_checkout` with a product ID, **Then** a WhatsApp message is sent to the lead containing the product's `link_checkout` formatted as `"Aqui está o link para [product.nome]: [link_checkout]"`, **And** the tool returns `{ sent: true, messageId: string }`.
2. **Given** the agent detects strong purchase-intent signals, **When** `marcar_intencao_compra` is called, **Then** `leads.temperatura` is updated to `'quente'`, **And** a journey event is created: `{ tipo: 'interesse', detalhes: { produto_id, agente_id } }`.
3. **Given** the agent identifies a lead tag from the conversation, **When** `adicionar_tag` is called with tag text, **Then** the tag is inserted into `lead_tags` with `origem_tag: 'agente'`, **And** the lead immediately matches segment filters using that tag.
4. **Given** `adicionar_tag` is called with a tag that already exists for the lead, **When** executed, **Then** the tool returns success WITHOUT creating a duplicate tag (idempotent).
5. **Given** the agent needs to classify which tag to apply, **When** `adicionar_tag` is called, **Then** the tag classification uses Claude Haiku (not Sonnet) to identify the most appropriate tag from the conversation context.

## Tasks / Subtasks

- [x] Task 1: `enviar_link_checkout` tool use case (AC: #1)
  - [x] Create `packages/agent/src/tools/enviar-link-checkout.ts`
  - [x] Input from schema: `{ productId }`; from ctx: `{ tenantId, leadPhone, connectionId, conversationWindowId, leadId }`
  - [x] Fetch the product by `id` + `tenantId`; read `link_checkout`
  - [x] Call `@leedi/connection` `MetaCloudProvider.sendText()` with `"Aqui está o link para {nome}: {link_checkout}"`
  - [x] Save the outbound message to `messages` (`autor='agente'`)
  - [x] Return `{ sent: true, messageId: string }`
- [x] Task 2: `marcar_intencao_compra` tool use case (AC: #2)
  - [x] Create `packages/agent/src/tools/marcar-intencao-compra.ts`
  - [x] Input from schema: `{ productId? }`; from ctx: `{ tenantId, leadId }`
  - [x] `UPDATE leads SET temperatura = 'quente' WHERE id = leadId` (via `withTenant`)
  - [x] `INSERT` into `lead_journey_events` with `tipo='interesse'`, `detalhes: { produto_id, agente_id: 'agent' }`
  - [x] Return `{ updated: true }`
- [x] Task 3: `adicionar_tag` tool use case (AC: #3, #4, #5)
  - [x] Create `packages/agent/src/tools/adicionar-tag.ts`
  - [x] Input from schema: `{ tagText, conversationContext? }`; from ctx: `{ tenantId, leadId }`
  - [x] If `conversationContext` is provided, call Claude Haiku to refine/classify the tag. Interim hardcoded model id `claude-haiku-4-5-20251001`; TODO references Story 7.8 for the canonical map.
  - [x] Idempotency via IN-APP dedup (NOT `ON CONFLICT`): `lead_tags` has no `(tenant_id, lead_id, tag)` unique constraint, so the tool queries for the existing tag first and skips the insert if found. See Completion Notes for the residual intra-turn race and the deferred constraint.
  - [x] Insert with `origem_tag='agente'`; return `{ tagged: true, tag: string }`
- [x] Task 4: Register tools in the registry (AC: #1–#5) — integration point is Story 7.2
  - [x] Updated `marcar_intencao_compra` and `adicionar_tag` JSON Schemas in `TOOL_DEFINITIONS` to match Task 2/3 input specs (old `nivel`/`observacao`/`tag` fields were unreachable for AC#2/#5)
  - [x] `enviar_link_checkout` and `marcar_intencao_compra` are ALWAYS-ON; `adicionar_tag` is CONFIGURABLE (membership in `resolve-enabled-tools.ts`; gating done by `buildToolList`)
  - [x] Wired each into `routeToolCall`; no new router
- [x] Task 5: Tests (AC: #1, #2, #4, #5)
  - [x] Unit: `enviar_link_checkout` formats the message exactly and calls `MetaCloudProvider.sendText` (mocked); returns `{ sent: true, messageId }`
  - [x] Unit: `marcar_intencao_compra` sets `temperatura='quente'` and creates a `tipo='interesse'` journey event
  - [x] Unit: `adicionar_tag` is idempotent on a duplicate tag; calls Haiku for classification when `conversationContext` is provided (mock Anthropic, assert the Haiku model id `claude-haiku-4-5-20251001`)

## Dev Notes

- Files to create: `packages/agent/src/tools/{enviar-link-checkout,marcar-intencao-compra,adicionar-tag}.ts`.
- Files to modify: `packages/agent/src/tools/registry.ts` (schemas + routing).
- npm dependencies: none new — `@anthropic-ai/sdk` already added in 7.2 (used here for Haiku tag classification); `@leedi/connection`, `@leedi/db`.
- These are the WRITE/conversion tools (counterpart to the read tools in 7.3). Two are always-on (checkout + intent); `adicionar_tag` is toggle-gated.
- Haiku usage here is the FIRST place a non-sales task uses a cheaper model. The hardcoded model string is acceptable as an interim; Story 7.8 replaces it with the canonical `TASK_MODELS`/`SALES_MODELS` map — leave a clear TODO referencing 7.8.
- @leedi/agent-memory isolation applies: these tools write lead/journey/message/tag tables (NOT agent-memory) and are dispatched from the 7.2 loop.

### Testing standards

- Unit tests mock `@leedi/connection`, the DB layer, and the Anthropic client. Assert message formatting, DB mutations, idempotency, and the Haiku model selection.

### Pitfalls to avoid

- Do NOT use Sonnet for tag classification — it must be Haiku (cost). Story 7.8 enforces this centrally; do not regress.
- `adicionar_tag` MUST be idempotent — rely on a DB unique constraint + `ON CONFLICT DO NOTHING`, not just an in-app check (race-safe).
- Do NOT forget to persist the outbound checkout message to `messages` with `autor='agente'` — the inbox must reflect what the agent sent.
- Format the checkout message EXACTLY as the AC specifies — the lead sees this literal text.

### Project Structure Notes

- Tool implementations in `packages/agent/src/tools/`; registered once in `registry.ts`. Conversion writes flow through the same use-case-per-write convention.

### References

- [Source: docs/01-leedi-arquitetura.md#7.3 As tools (ferramentas) do agente]
- [Source: docs/01-leedi-arquitetura.md#7.4 Roteamento de modelos]
- [Source: _bmad-output/planning-artifacts/epics.md#Story 7.4: Sales & Conversion Tools (Checkout, Intent, Tagging)]
- [Source: _bmad-output/implementation-artifacts/4-5-outbound-message-sending-via-meta-cloud-api.md] (MetaCloudProvider.sendText)
- [Source: _bmad-output/implementation-artifacts/7-2-agent-core-processing-loop.md] (tool registry integration)
- [Source: _bmad-output/implementation-artifacts/7-8-model-routing-cost-optimization.md] (Haiku routing canonicalization)

## Dev Agent Record

### Agent Model Used

claude-opus-4-8

### Debug Log References

_none_

### Completion Notes List

- All three tools implemented as thin use cases under `packages/agent/src/tools/`, wired into the single `routeToolCall` dispatcher in `registry.ts`. No new router.
- **Schema correction (Task 4):** the 7.2 registry schemas for `marcar_intencao_compra` (`{ nivel, observacao }`) and `adicionar_tag` (`{ tag }`) did NOT match the Task 2/3 input specs and made AC#2 (`produto_id` in journey detalhes) and AC#5 (Haiku classification from conversation context) unreachable from the model — Claude had no schema field to supply `productId`/`conversationContext`. Updated the schemas to `{ productId? }` and `{ tagText, conversationContext? }`. The general "Task 4 is wiring only" note was overridden by the specific Task 2/3 input specs. Grep confirmed nothing outside the registry binds the old field names (the `ToolsHabilitadas` toggle keys are unaffected). `registry.test.ts` only asserts that ctx/identity fields are absent from schemas, so it still passes unchanged.
- **`adicionar_tag` idempotency — in-app dedup (deviates from the line 69 pitfall):** `lead_tags` has no DB-level `(tenant_id, lead_id, tag)` unique constraint, so `ON CONFLICT DO NOTHING` is unavailable. Per the task instruction, dedup is done in-app: query for the existing tag inside the same `withTenant` tx, return success without inserting if found. When `conversationContext` is supplied, classification runs FIRST and dedup keys on the refined tag. **Residual race:** `runToolLoop` dispatches tool calls via `Promise.all` (parallel), so two `adicionar_tag` calls for the same tag within ONE turn can both pass the existence check and double-insert. In-app dedup closes the cross-turn case, not the intra-turn one — the proper fix is a follow-up migration adding the `(tenant_id, lead_id, tag)` unique constraint, after which this can fall back to a race-safe DB upsert.
- **Haiku model:** interim hardcoded id `claude-haiku-4-5-20251001` (Haiku, never Sonnet) with a `TODO(Story 7.8)` to canonicalize via the model map. `classifyTag` instantiates `new Anthropic()` (SDK reads `ANTHROPIC_API_KEY` from env) and runs OUTSIDE the DB transaction so no tx is held open across the API call. Falls back to the raw `tagText` if the model returns nothing usable.
- **Checkout message:** body formatted EXACTLY as `"Aqui está o link para {nome}: {link_checkout}"`; outbound persisted to `messages` with `autor='agente'`, `direction='outbound'`, `tipo='texto'`, `status='enviado'`, `metaMessageId` from the send result. The connection is loaded by `tenantId` (the table is unique on `tenant_id`) inside `withTenant`, mirroring `loadAgentContext`.
- Verification: `pnpm --filter @leedi/agent test` → 60 passed (12 files); `typecheck` clean (`exactOptionalPropertyTypes` honored in the dispatcher by conditionally spreading optional keys); `lint` clean.

### File List

Created:
- `packages/agent/src/tools/enviar-link-checkout.ts`
- `packages/agent/src/tools/marcar-intencao-compra.ts`
- `packages/agent/src/tools/adicionar-tag.ts`
- `packages/agent/src/tools/__tests__/enviar-link-checkout.test.ts`
- `packages/agent/src/tools/__tests__/marcar-intencao-compra.test.ts`
- `packages/agent/src/tools/__tests__/adicionar-tag.test.ts`

Modified:
- `packages/agent/src/tools/registry.ts` (updated `marcar_intencao_compra` + `adicionar_tag` schemas; imported and wired all three tools into `routeToolCall`)

### Change Log

- 2026-06-01: Implemented Story 7.4 — `enviar_link_checkout`, `marcar_intencao_compra`, `adicionar_tag` tools + tests; corrected 7.2 schemas for the latter two; wired into the registry. Status → review.
