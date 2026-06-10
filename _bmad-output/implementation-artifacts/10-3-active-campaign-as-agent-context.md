---
baseline_commit: 992b842
---

# Story 10.3: Active Campaign as Agent Context

Status: done

## Story

As a lead,
I want the agent to always offer me the right product for the current campaign phase,
so that I receive timely and relevant offers that match what the business is promoting right now.

## Acceptance Criteria

1. **Given** a campaign with `status: ativa` and `fase: carrinho_aberto`, **When** the agent calls `consultar_ofertas_ativas`, **Then** the tool returns the campaign's effective product for the current phase (main product during `carrinho_aberto`; downsell product during `downsell` phase), along with the campaign's urgency message, key messages, and `instrucao_comercial` for that phase.
2. **Given** two campaigns exist but only one has `status: ativa`, **When** the agent calls `consultar_ofertas_ativas`, **Then** only the active campaign's current-phase product is returned — the non-active campaign's products are not included.
3. **Given** no campaign has `status: ativa`, **When** the agent calls `consultar_ofertas_ativas`, **Then** the tool returns an empty result (`{ produtos: [], campanha: null }`) and the agent responds helpfully without a specific product offer (does not error or refuse to respond).
4. **Given** a lead has `comprou: true` for the current phase's product, **When** the agent calls `verificar_elegibilidade` for that product, **Then** it returns `{ eligible: false, reason: 'already_purchased' }` — the agent does NOT re-offer the product. This behavior is inherited from Story 7.3; this story must verify it works end-to-end with real campaign data.
5. **Given** a campaign transitions from `carrinho_aberto` to `downsell` (Story 10.2), **When** the next `consultar_ofertas_ativas` call is made, **Then** it returns the downsell product, not the main product — the switch is instant, no cache invalidation needed (tool reads live DB state).
6. **Given** the active campaign's `config.carrinho_aberto.urgencia` is "Últimas vagas! Oferta encerra amanhã às meia-noite", **When** `consultar_ofertas_ativas` is called, **Then** the tool result includes `urgencia: "Últimas vagas! ..."`, `mensagens_chave: [...]`, and `instrucao_comercial: "Ofereça ativamente. Use a urgência configurada."`.
7. **Given** an active campaign in `fase: aquecimento`, **When** `consultar_ofertas_ativas` is called, **Then** the tool returns the campaign's main product BUT with `instrucao_comercial: "Fase de aquecimento — mantenha o lead engajado. Não force a venda. O carrinho ainda não está aberto."` — o agente usa o produto para contextualizar a conversa mas não aciona fluxo de compra agressivo.
8. **Given** an active campaign with `tipo: perpetuo`, **When** `consultar_ofertas_ativas` is called at any moment, **Then** the tool returns the campaign's main product with `instrucao_comercial: "Produto disponível para venda contínua. Ofereça quando o lead demonstrar interesse, sem urgência artificial."` — campanhas perpétuas não têm fase de lançamento e não entram em transição de fase.

## Tasks / Subtasks

- [x] Task 1: Update `consultar_ofertas_ativas` tool to read from campaigns (AC: #1, #2, #3, #5, #6, #7, #8)
  - [x] Locate `packages/agent/src/tools/consultar-ofertas-ativas.ts` (created in Story 7.3)
  - [x] Replace the current product lookup with a campaign-aware lookup (queries campaigns table directly)
  - [x] If no active campaign: return `{ produtos: [], campanha: null }`
  - [x] Return `{ produtos: [EffectiveProduto], campanha: ActiveCampaignContext }` with instrucao_comercial per tipo + fase
- [x] Task 2: Update `verificar_elegibilidade` tool integration (AC: #4)
  - [x] Confirm the tool already checks `lead.comprou` and `lead.produto_comprado_id`
  - [x] Add test: when active campaign's effective product is same as `lead.produto_comprado_id`, returns `{ eligible: false, reason: 'already_purchased' }`
- [x] Task 3: Playground integration (AC: #1, #2, #3)
  - [x] Add `campaignId?: string` to `ToolContext`
  - [x] Add `campaignId?: string` to `ProcessMessageInput`
  - [x] Pass `campaignId` from playground request to `processMessage`
  - [x] Tool uses `campaignId` override when present; falls back to globally active campaign
- [x] Task 4: Tests (AC: #1, #2, #3, #5, #6, #7, #8)
  - [x] Unit: `consultar_ofertas_ativas` com campanha `carrinho_aberto` ativa retorna produto principal + urgência + instrucao_comercial
  - [x] Unit: `consultar_ofertas_ativas` com campanha `downsell` ativa retorna produto downsell
  - [x] Unit: `consultar_ofertas_ativas` sem campanha ativa retorna `{ produtos: [], campanha: null }`
  - [x] Unit: `consultar_ofertas_ativas` com campanha `aquecimento` ativa retorna produto mas instrucao_comercial correta
  - [x] Unit: `consultar_ofertas_ativas` com campanha `tipo: perpetuo` retorna produto + instrucao perpetuo
  - [x] Unit: duas campanhas (uma ativa, uma rascunho) retorna somente a ativa
  - [x] Integration: `verificar_elegibilidade` retorna `eligible: false` para lead que comprou o produto da campanha ativa
  - [x] Unit: playground com `campaignId` explícito usa aquela campanha

## Dev Notes

- Files to modify: `packages/agent/src/tools/consultar-ofertas-ativas.ts` (complete rewrite), `packages/agent/src/tools/types.ts` (add campaignId), `packages/agent/src/use-cases/process-message.ts` (add campaignId to input + toolCtx), `apps/api/src/routes/playground/index.ts` (pass campaignId).
- The tool no longer uses `getActiveOffers` from `@leedi/knowledge` — queries campaigns + products directly via `@leedi/db`.
- Return type changed from `ActiveOffer[]` to `OfertasAtivasResult` — breaking change handled by updating `index.ts` exports.
- Do NOT cache the active campaign — read live DB state so phase transitions take effect immediately.

### References

- [Source: docs/01-leedi-arquitetura.md#6.8 Domínio Campaign]
- [Source: _bmad-output/planning-artifacts/epics.md#Story 10.3]
- [Source: _bmad-output/implementation-artifacts/10-1-campaign-crud-phase-schema.md] (campaigns schema)
- [Source: _bmad-output/implementation-artifacts/10-2-campaign-activation-phase-transitions.md] (fase transitions)

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

- `ActiveOffer` export removed from `consultar-ofertas-ativas.ts` — `index.ts` updated to export new types (`EffectiveProduto`, `ActiveCampaignContext`, `OfertasAtivasResult`).
- `ToolContext.campaignId` added as optional field for playground sandbox mode.
- Return type changed from `ActiveOffer[]` to `OfertasAtivasResult` — all 112 agent tests pass.

### Completion Notes List

- `consultar-ofertas-ativas.ts`: complete rewrite to query campaigns table, compute instrucao_comercial, handle all fase + tipo combos, downsell product override, playground campaignId override.
- `verificar-eligibilidade.test.ts`: added AC#4 test for already_purchased with campaign product.
- `process-message.ts`: campaignId added to ProcessMessageInput + toolCtx.
- playground router: passes campaignId from request to processMessage.
- All 112 agent tests pass, typecheck clean.

### File List

packages/agent/src/tools/consultar-ofertas-ativas.ts
packages/agent/src/tools/types.ts
packages/agent/src/index.ts
packages/agent/src/use-cases/process-message.ts
packages/agent/src/tools/__tests__/consultar-ofertas-ativas.test.ts
packages/agent/src/tools/__tests__/verificar-eligibilidade.test.ts
apps/api/src/routes/playground/index.ts

### Change Log

- Story 10.3 implemented: campaign-aware agent tool, playground campaignId override (Date: 2026-06-02)

### Senior Developer Review (2026-06-10)

- No code changes required — implementation holds up against all 8 ACs.
- **Breaking-change audit (the main risk):** return type changed `ActiveOffer[]` → `OfertasAtivasResult`
  and the tool dropped `getActiveOffers` from `@leedi/knowledge`. Grepped the whole repo: no surviving
  caller treats the result as an array — `registry.ts` returns the tool result straight to the LLM, so
  the shape change is serialized safely. `@leedi/knowledge` still exports `getActiveOffers` for its own
  use; no dangling consumer. ✅
- **Downsell resolution is single-pathed (no drift):** `transitionCampaignPhase` only mutates `fase`;
  the effective product is resolved exclusively in `consultarOfertasAtivas` from live state via
  `config.downsell.produto_id` (matches 10.1 AC#5). No second drifting code path. ✅ (AC#5)
- AC#3 empty-state `{ produtos: [], campanha: null }` and AC#7/#8 exact `instrucao_comercial` strings
  verified against the ACs. Playground `campaignId` is `z.string().uuid()`-validated → avoids the
  non-UUID-500 class of bug seen in Epic 8.
- Verified at HEAD: full `@leedi/agent` suite 120/120 green, agent typecheck clean.
