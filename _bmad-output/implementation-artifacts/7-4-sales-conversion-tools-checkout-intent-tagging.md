---
baseline_commit: 9ea8a05
---

# Story 7.4: Sales & Conversion Tools (Checkout, Intent, Tagging)

Status: ready-for-dev

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

- [ ] Task 1: `enviar_link_checkout` tool use case (AC: #1)
  - [ ] Create `packages/agent/src/tools/enviar-link-checkout.ts`
  - [ ] Input: `{ tenantId: string, leadPhone: string, productId: string, connectionId: string }`
  - [ ] Fetch the product by `id` + `tenantId`; read `link_checkout`
  - [ ] Call `@leedi/connection` `MetaCloudProvider.sendText()` with `"Aqui está o link para {nome}: {link_checkout}"`
  - [ ] Save the outbound message to `messages` (`autor='agente'`)
  - [ ] Return `{ sent: true, messageId: string }`
- [ ] Task 2: `marcar_intencao_compra` tool use case (AC: #2)
  - [ ] Create `packages/agent/src/tools/marcar-intencao-compra.ts`
  - [ ] Input: `{ tenantId: string, leadId: string, productId?: string, agenteId?: string }`
  - [ ] `UPDATE leads SET temperatura = 'quente' WHERE id = leadId` (via `withTenant`)
  - [ ] `INSERT` into `lead_journey_events` with `tipo='interesse'`, `detalhes: { produto_id, agente_id }`
  - [ ] Return `{ updated: true }`
- [ ] Task 3: `adicionar_tag` tool use case (AC: #3, #4, #5)
  - [ ] Create `packages/agent/src/tools/adicionar-tag.ts`
  - [ ] Input: `{ tenantId: string, leadId: string, tagText: string, conversationContext?: string }`
  - [ ] If `conversationContext` is provided, call Claude Haiku to refine/classify the tag. Prompt: "Given this conversation context, what is the most appropriate tag for this lead? Return only the tag text in Portuguese, lowercase, max 3 words." (use the Haiku model id; the canonical model map lands in Story 7.8 — reference `TASK_MODELS.tag_classification` once 7.8 exists)
  - [ ] `INSERT INTO lead_tags (... origem_tag='agente')` with `ON CONFLICT DO NOTHING` for idempotency (requires a unique key on `(tenant_id, lead_id, tag)` — confirm it exists from Epic 5; if absent, dedupe in-app and note it)
  - [ ] Return `{ tagged: true, tag: string }`
- [ ] Task 4: Register tools in the registry (AC: #1–#5) — integration point is Story 7.2
  - [ ] In `packages/agent/src/tools/registry.ts`, add JSON Schemas for `enviar_link_checkout`, `marcar_intencao_compra`, `adicionar_tag`
  - [ ] `enviar_link_checkout` and `marcar_intencao_compra` are ALWAYS-ON; `adicionar_tag` is CONFIGURABLE (toggle `tools_habilitadas.adicionar_tag`)
  - [ ] Wire each into `routeToolCall`; do NOT create a new router
- [ ] Task 5: Tests (AC: #1, #2, #4, #5)
  - [ ] Unit: `enviar_link_checkout` formats the message exactly and calls `MetaCloudProvider.sendText` (mocked); returns `{ sent: true, messageId }`
  - [ ] Unit: `marcar_intencao_compra` sets `temperatura='quente'` and creates a `tipo='interesse'` journey event
  - [ ] Unit: `adicionar_tag` is idempotent on a duplicate tag; calls Haiku for classification when `conversationContext` is provided (mock Anthropic, assert the Haiku model id)

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

_not yet assigned_

### Debug Log References

_none_

### Completion Notes List

_not yet implemented_

### File List

_not yet implemented_

### Change Log

_none_
