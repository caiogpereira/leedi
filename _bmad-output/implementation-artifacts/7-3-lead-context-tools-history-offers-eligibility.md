---
baseline_commit: 9ea8a05
---

# Story 7.3: Lead Context Tools (History, Offers, Eligibility)

Status: review

## Story

As a lead,
I want the agent to know who I am, what I've done before, and what's relevant to offer me,
so that conversations feel personalized and not repetitive.

## Acceptance Criteria

1. **Given** a lead who participated in a previous launch contacts the business, **When** the agent calls `buscar_historico_lead`, **Then** the tool returns: lead journey events (last 20, ordered by `created_at` DESC), purchase history (`comprou` + `produto_comprado_id`), qualification data (`qualificacao` jsonb), and the `lead_recorrente` flag.
2. **Given** a lead who already purchased the main product contacts the business, **When** the agent calls `verificar_elegibilidade` for that product, **Then** the tool returns `{ eligible: false, reason: 'already_purchased' }`.
3. **Given** the active campaign is in `downsell` phase, **When** the agent calls `consultar_ofertas_ativas`, **Then** only the downsell product for that campaign is returned.
4. **Given** no campaign is active, **When** the agent calls `consultar_ofertas_ativas`, **Then** all active products for the tenant (`tipo='principal'`) are returned (for evergreen use).
5. **Given** a lead that has `lead_recorrente: true` and history showing previous objections, **When** `buscar_historico_lead` is called, **Then** the result includes the previous objections from `lead_journey_events` (`tipo='objecao'`).

## Tasks / Subtasks

- [x] Task 1: `buscar_historico_lead` tool use case (AC: #1, #5)
  - [x] Create `packages/agent/src/tools/buscar-historico-lead.ts`
  - [x] Input: `{ tenantId: string, leadPhone: string }`
  - [x] Fetch the lead by phone (`leads` table); retrieve the last 20 `lead_journey_events` (`ORDER BY created_at DESC LIMIT 20`); include events of `tipo='objecao'` so previous objections surface
  - [x] Build `{ lead, recentEvents, qualificacao, lead_recorrente }` (where `qualificacao` is the lead's `qualificacao` jsonb and `lead_recorrente` the boolean flag)
  - [x] All reads via `withTenant`
- [x] Task 2: `verificar_elegibilidade` tool use case (AC: #2)
  - [x] Create `packages/agent/src/tools/verificar-eligibilidade.ts`
  - [x] Input: `{ tenantId: string, leadId: string, productId: string }`
  - [x] If `lead.comprou = true` AND `lead.produto_comprado_id = productId` → `{ eligible: false, reason: 'already_purchased' }`
  - [x] If the active campaign is in `'encerrada'` phase → `{ eligible: false, reason: 'campaign_closed' }`
  - [x] If the product is out of the current campaign phase scope → `{ eligible: false, reason: 'campaign_phase' }`
  - [x] Otherwise → `{ eligible: true }`
- [x] Task 3: `consultar_ofertas_ativas` tool use case (AC: #3, #4)
  - [x] Create `packages/agent/src/tools/consultar-ofertas-ativas.ts`
  - [x] Input: `{ tenantId: string }`
  - [x] Fetch the active campaign (`status='ativa'`); if `'carrinho_aberto'` phase → main product; if `'downsell'` phase → downsell product; if no active campaign → all active `tipo='principal'` products
  - [x] If Story 6.1's `getActiveOffers` use case exists in `@leedi/db`, REUSE it; otherwise implement the query here and document
  - [x] Returns `Product[]` with full commercial fields (`nome`, `preco`, `linkCheckout`, `argumentos`, `diferenciais`, `provasSociais`, `garantia`, `bonus`, `tipo`)
- [x] Task 4: Register tools in the registry (AC: #1–#5) — integration point is Story 7.2
  - [x] In `packages/agent/src/tools/registry.ts` (from Story 7.2), add the JSON Schema definitions for `buscar_historico_lead`, `verificar_elegibilidade`, `consultar_ofertas_ativas`
  - [x] All three are ALWAYS-ON (not toggle-gated) — they appear in `buildToolList` regardless of `tools_habilitadas`
  - [x] Wire each into `routeToolCall` to dispatch to the use cases above
  - [x] Do NOT create a new router — use the single registry from 7.2
- [x] Task 5: Tests (AC: #1, #2, #3, #5)
  - [x] Unit: `buscar_historico_lead` returns the correct shape and includes objection events
  - [x] Unit: `verificar_elegibilidade` returns `{ eligible: false, reason: 'already_purchased' }` when the lead already bought that product
  - [x] Unit: `consultar_ofertas_ativas` returns the downsell product when the campaign is in `downsell` phase; returns all `principal` products when no campaign is active
  - [x] Unit: `buildToolList` always includes these three regardless of toggles

## Dev Notes

- Files to create: `packages/agent/src/tools/{buscar-historico-lead,verificar-eligibilidade,consultar-ofertas-ativas}.ts`.
- Files to modify: `packages/agent/src/tools/registry.ts` (add schemas + routing), `packages/agent/src/index.ts` if the tools need re-export for tests.
- npm dependencies: none new — reuse `@leedi/db` (`withTenant`, `schema`, `eq`, `and`, `desc`, `limit`).
- These tools READ lead/campaign/product data; they do NOT write. They are the lead-context half of the toolset; conversion tools (write) are Story 7.4.
- `leads`, `lead_journey_events` come from Epic 5; `products` / campaign phases from Epic 6. If campaign-phase modeling is not yet finalized at impl time, treat the phase as a parameter passed from `process-message`'s loaded campaign context and document the assumption.
- @leedi/agent-memory isolation still applies: these tools touch lead/campaign/product tables (NOT agent-memory tables) and are dispatched from the loop in 7.2.

### Testing standards

- Unit tests mock the DB layer; assert result shapes and the eligibility/offer decision branches exhaustively.
- Use realistic fixtures: a recurring lead with objection events, a lead who already purchased, an active campaign in each phase.

### Pitfalls to avoid

- Do NOT toggle-gate these tools — they are always on. Gating them would blind the agent to the lead's history.
- Do NOT return more than the last 20 journey events — keep the tool payload bounded for token cost.
- Do NOT duplicate `getActiveOffers` if Story 6.1 already shipped it — reuse to avoid drift in offer-decision logic.
- Eligibility must check BOTH `comprou` and `produto_comprado_id` — a lead who bought a different product is still eligible for this one.

### Project Structure Notes

- Tool implementations live in `packages/agent/src/tools/`. They are registered once in `registry.ts` and invoked by `process-message`. No tool defines its own router.

### References

- [Source: docs/01-leedi-arquitetura.md#7.3 As tools (ferramentas) do agente]
- [Source: docs/01-leedi-arquitetura.md#7.6 Inteligência de qualificação]
- [Source: _bmad-output/planning-artifacts/epics.md#Story 7.3: Lead Context Tools (History, Offers, Eligibility)]
- [Source: _bmad-output/implementation-artifacts/6-1-product-catalog-crud.md] (getActiveOffers / products)
- [Source: _bmad-output/implementation-artifacts/7-2-agent-core-processing-loop.md] (tool registry integration)

## Dev Agent Record

### Agent Model Used

claude-opus-4-8

### Debug Log References

_none_

### Completion Notes List

- Implemented the three always-on lead-context tools as use cases under `packages/agent/src/tools/` and wired them into the single `routeToolCall` dispatcher in `registry.ts` (schemas already existed in `TOOL_DEFINITIONS` / `ALWAYS_ON_TOOLS` from Story 7.2 — Task 4 was wiring only, not schema authoring).
- **Campaign-phase assumption (per Dev Notes line 61):** no campaigns table exists yet (the `@leedi/campaign` package is an empty stub; `process-message.ts` itself documents that "campaign scoping lands in a later epic"). Following the story's sanctioned fallback, the active campaign phase is modeled as an OPTIONAL `campaignPhase?: CampaignPhase` field on `ToolContext` (`'carrinho_aberto' | 'downsell' | 'encerrada'`), injected by `process-message` from its loaded campaign context. It is `undefined` today (the evergreen path), so `consultar_ofertas_ativas` returns all `principal` products and `verificar_elegibilidade` falls through to the purchase-only check. When a later epic ships campaigns, `process-message` populates this field and the phase-aware branches activate with no changes to these tools. `process-message.ts` was intentionally NOT modified (out of scope; not in the story's files-to-modify list).
- **`consultar_ofertas_ativas` reuses `getActiveOffers` from `@leedi/knowledge`** (single source of offer-fetch logic — avoids drift, per the pitfalls note). It fetches all active offers once and filters by phase in-memory: `downsell` → `tipo==='downsell'`; `carrinho_aberto`/evergreen → `tipo==='principal'`; `encerrada` → `[]`. Required adding `@leedi/knowledge` as a workspace dependency of `@leedi/agent` (no dependency cycle — `@leedi/knowledge` depends only on `@leedi/db`).
- **`verificar_elegibilidade` decision order:** `already_purchased` (checks BOTH `comprou` AND `produto_comprado_id` so a lead who bought a different product stays eligible) → `campaign_closed` → `campaign_phase` → `eligible`. The phase branches only fire when `campaignPhase` is present.
- **`buscar_historico_lead`** resolves the lead by `tenantId + telefone`, returns the shape `{ found, lead, recentEvents, tags, qualificacao, lead_recorrente }`, and caps journey events at the last 20 (`ORDER BY created_at DESC LIMIT 20`). Objection events surface naturally within that window (no separate objections field). Segmentation `tags` (from `lead_tags`) are included to match the tool description Claude sees ("interações passadas, tags, temperatura"); AC#1 does not require tags but the payload now honors the advertised contract.
- **DB query patterns:** `desc` is NOT re-exported from `@leedi/db`; used the established codebase pattern `.orderBy(sql\`${col} DESC\`).limit(n)` (matches `messaging`/`agent-memory` use cases).
- Updated the existing `registry.test.ts` "pending result" assertion to use `transferir_humano` (still unimplemented) since `buscar_historico_lead` is now wired to a real implementation.
- All tools exported from `@leedi/agent` barrel (`src/index.ts`) for test/consumer access.
- Verification: `pnpm --filter @leedi/agent test` → 51 passed (9 files); `pnpm --filter @leedi/agent typecheck` → clean.

### File List

**Created**
- `packages/agent/src/tools/buscar-historico-lead.ts`
- `packages/agent/src/tools/verificar-eligibilidade.ts`
- `packages/agent/src/tools/consultar-ofertas-ativas.ts`
- `packages/agent/src/tools/__tests__/buscar-historico-lead.test.ts`
- `packages/agent/src/tools/__tests__/verificar-eligibilidade.test.ts`
- `packages/agent/src/tools/__tests__/consultar-ofertas-ativas.test.ts`

**Modified**
- `packages/agent/src/tools/types.ts` — added optional `campaignPhase` field + `CampaignPhase` type to `ToolContext`
- `packages/agent/src/tools/registry.ts` — wired the three tools into `routeToolCall` (no schema changes; schemas pre-existed)
- `packages/agent/src/tools/__tests__/registry.test.ts` — updated the "pending result" test to target a still-unimplemented tool
- `packages/agent/src/index.ts` — re-exported the three tools + their types and `CampaignPhase`
- `packages/agent/package.json` — added `@leedi/knowledge` workspace dependency

### Change Log

- 2026-06-01: Implemented Story 7.3 lead-context tools (history, offers, eligibility); status → review.
