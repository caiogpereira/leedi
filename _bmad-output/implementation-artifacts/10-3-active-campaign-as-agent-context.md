---
baseline_commit: 9ea8a05
---

# Story 10.3: Active Campaign as Agent Context

Status: ready-for-dev

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

- [ ] Task 1: Update `consultar_ofertas_ativas` tool to read from campaigns (AC: #1, #2, #3, #5, #6, #7, #8)
  - [ ] Locate `packages/agent/src/tools/consultar_ofertas_ativas.ts` (created in Story 7.3)
  - [ ] Replace the current product lookup with a campaign-aware lookup:
    1. Query `campaigns` for the tenant's single active campaign (`status = 'ativa'`)
    2. Determine the effective product:
       - Se `fase = 'downsell'` AND `config.downsell.produto_id` exists → use `config.downsell.produto_id`
       - Else → use `campaigns.produto_id`
    3. Fetch the effective product from `products` table (name, description, price, installments, checkout_link, type)
    4. Fetch the active phase config from `campaigns.config[campaigns.fase]`: urgency + key messages
    5. Compute `instrucao_comercial` based on `tipo` + `fase`:
       ```ts
       function getInstrucaoComercial(tipo: CampaignTipo, fase: CampaignFase): string {
         if (tipo === 'perpetuo') return 'Produto disponível para venda contínua. Ofereça quando o lead demonstrar interesse, sem urgência artificial.'
         if (fase === 'aquecimento') return 'Fase de aquecimento — mantenha o lead engajado. Não force a venda. O carrinho ainda não está aberto.'
         if (fase === 'carrinho_aberto') return 'Carrinho aberto. Ofereça ativamente. Use a urgência configurada.'
         if (fase === 'downsell') return 'Fase de downsell. Ofereça o produto alternativo para quem não comprou o principal.'
         return 'Ofereça quando relevante.'
       }
       ```
    6. Return `{ produtos: [EffectiveProduto], campanha: { id, nome, tipo, fase, urgencia, mensagens_chave, instrucao_comercial } }`
  - [ ] If no active campaign: return `{ produtos: [], campanha: null }`
  - [ ] The product is fetched from the `@leedi/knowledge` package (or the `products` table via `@leedi/db`) — do NOT duplicate the product schema; import from the existing knowledge domain
- [ ] Task 2: Update `verificar_elegibilidade` tool integration (AC: #4)
  - [ ] In `packages/agent/src/tools/verificar_elegibilidade.ts` (Story 7.3), confirm the tool already checks `lead.comprou` and `lead.produto_comprado_id`
  - [ ] Add a test: when the active campaign's effective product is the same as `lead.produto_comprado_id`, `verificar_elegibilidade` returns `{ eligible: false, reason: 'already_purchased' }`
  - [ ] No code change expected — this is a verification + test-coverage story
- [ ] Task 3: Playground integration (AC: #1, #2, #3)
  - [ ] In the playground route (`apps/api/src/routes/playground/index.ts` from Story 8.1), when `campaignId` is provided, pass it to the agent context so `consultar_ofertas_ativas` uses the selected campaign instead of looking up the globally active one
  - [ ] This requires a `campaignId` override parameter in `ProcessMessageContext` (or resolve the campaign before calling `process-message` and inject it into the tool context)
  - [ ] When `campaignId` is absent in playground, fall back to the globally active campaign (same as production behavior)
- [ ] Task 4: Tests (AC: #1, #2, #3, #5, #6, #7, #8)
  - [ ] Unit: `consultar_ofertas_ativas` com campanha `carrinho_aberto` ativa retorna produto principal + urgência + `instrucao_comercial: 'Carrinho aberto...'`
  - [ ] Unit: `consultar_ofertas_ativas` com campanha `downsell` ativa retorna produto downsell + `instrucao_comercial: 'Fase de downsell...'`
  - [ ] Unit: `consultar_ofertas_ativas` sem campanha ativa retorna `{ produtos: [], campanha: null }`
  - [ ] Unit: `consultar_ofertas_ativas` com campanha `aquecimento` ativa retorna produto mas `instrucao_comercial: 'Fase de aquecimento — mantenha o lead engajado...'`
  - [ ] Unit: `consultar_ofertas_ativas` com campanha `tipo: perpetuo` retorna produto + `instrucao_comercial: 'Produto disponível para venda contínua...'`
  - [ ] Unit: duas campanhas (uma ativa, uma rascunho) retorna somente a ativa
  - [ ] Integration: `verificar_elegibilidade` retorna `eligible: false` para lead que comprou o produto da campanha ativa
  - [ ] Unit: playground com `campaignId` explícito usa aquela campanha; sem `campaignId` usa a ativa globalmente

## Dev Notes

- Files to modify: `packages/agent/src/tools/consultar_ofertas_ativas.ts` (campaign-aware lookup), `packages/agent/src/tools/verificar_elegibilidade.ts` (add test coverage only, likely no code change), `apps/api/src/routes/playground/index.ts` (campaignId override in context).
- This story **modifies** the behavior introduced in Story 7.3 (`consultar_ofertas_ativas`). The tool previously read products directly; now it reads the active campaign first. This is a breaking change to the tool's query path — add a test to confirm the OLD behavior (no campaign = empty products) still works as AC #3.
- The `@leedi/campaign` package is optional — if the campaign query is simple (single DB query), it can live inside the tool directly importing from `@leedi/db`. A dedicated package is warranted only if campaign querying is needed in multiple places (Epic 15 analytics, for example).
- The tool return type: `{ produtos: EffectiveProduto[]; campanha: ActiveCampaignContext | null }` where `ActiveCampaignContext = { id: string; nome: string; tipo: CampaignTipo; fase: CampaignFase; urgencia?: string; mensagens_chave?: string[]; instrucao_comercial: string }`. Export `ActiveCampaignContext` from `@leedi/agent` so the playground router can type-check it.
- **Campanhas perpétuas (`tipo: perpetuo`):** não têm fase de lançamento. Fase default é `carrinho_aberto` (a única fase usada). Nunca fazem transição de fase (Story 10.2 não aplica para perpétuo). UI da campanha perpétua não exibe as tabs de fase de aquecimento/downsell — apenas a configuração da fase principal.
- **Fase `aquecimento` e comportamento do agente:** a `instrucao_comercial` retornada instrui o agente a manter o lead engajado sem forçar conversão. Isso é suficiente para guiar o LLM — não requer mudança no system prompt.
- npm dependencies: none new.
- **Cross-epic dependency:** This story touches the tool registry from Story 7.2 (tool definitions + routing) and the knowledge domain from Story 6.1 (products table). Both must be complete or in a compatible state.

### Testing standards

- Unit tests: Vitest, mock the DB layer. Each AC scenario tested with a distinct mock setup.
- Integration: run the full agent loop against a local Supabase with: one active campaign in `carrinho_aberto`, one in `rascunho`, a product for each. Assert the correct product surfaces.

### Pitfalls to avoid

- Do NOT cache the active campaign in Redis — the agent must read live state so phase transitions (Story 10.2) take effect immediately on the next conversation turn.
- Do NOT fail the tool call when no campaign is active — return `{ produtos: [], campanha: null }` and let the agent handle it gracefully (AC #3).
- Do NOT hardcode "fetch first active campaign" as a race-prone query — use `LIMIT 1 WHERE status = 'ativa'` (the partial unique index from Story 10.1 ensures at most one is active per tenant).
- The playground `campaignId` override must NOT affect the production `process-message` path — sandbox mode is the gating condition.

### Project Structure Notes

- Tool implementation: `packages/agent/src/tools/consultar_ofertas_ativas.ts`. Playground override: `apps/api/src/routes/playground/index.ts`. No new packages.

### References

- [Source: docs/01-leedi-arquitetura.md#6.8 Domínio Campaign]
- [Source: _bmad-output/planning-artifacts/epics.md#Story 10.3]
- [Source: _bmad-output/implementation-artifacts/10-1-campaign-crud-phase-schema.md] (campaigns schema)
- [Source: _bmad-output/implementation-artifacts/10-2-campaign-activation-phase-transitions.md] (fase transitions)
- [Source: _bmad-output/implementation-artifacts/7-3-lead-context-tools-history-offers-eligibility.md] (consultar_ofertas_ativas original + verificar_elegibilidade)
- [Source: _bmad-output/implementation-artifacts/8-1-playground-chat-interface.md] (campaignId override in playground context)
- [Source: _bmad-output/implementation-artifacts/6-1-product-catalog-crud.md] (products table)

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
