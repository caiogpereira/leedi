---
baseline_commit: 9ea8a05
---

# Story 10.2: Campaign Activation & Phase Transitions

Status: ready-for-dev

## Story

As a tenant admin,
I want to activate a campaign and trigger phase transitions manually or on a scheduled date,
so that the agent automatically shifts its offer strategy at the right moment.

## Acceptance Criteria

1. **Given** a campaign is in `status: rascunho` (or `pausada`), **When** the admin clicks "Ativar campanha" and confirms, **Then** `status` changes to `ativa` and `fase` remains at its current value — the agent immediately starts using this campaign as the active offer context for all new conversations.
2. **Given** an attempt to activate a campaign when another campaign is already `ativa`, **When** confirmed, **Then** the API returns 409 with: "Já existe uma campanha ativa. Pause ou encerre a campanha atual antes de ativar outra." No change is made to either campaign.
3. **Given** an active campaign in `fase: carrinho_aberto`, **When** the admin clicks "Iniciar downsell" (manual transition) and confirms, **Then** `fase` changes to `downsell` and the campaign product switches to the configured downsell product (the `config.downsell.produto_id` override if present, else the campaign's default `produto_id`).
4. **Given** a campaign's `config.carrinho_aberto.transicao = { tipo: 'data', data: '2026-06-15T12:00:00Z' }`, **When** a BullMQ scheduled job runs at that date/time, **Then** `fase` transitions automatically from `carrinho_aberto` to `downsell` as if the admin clicked the manual button.
5. **Given** a lead already purchased during `fase: carrinho_aberto`, **When** the campaign transitions to `fase: downsell`, **Then** that lead's `comprou` flag is already `true` → `verificar_elegibilidade` returns `eligible: false` for the downsell product — no agent-side change needed, the eligibility check handles it.
6. **Given** an active campaign is paused via "Pausar campanha", **When** confirmed, **Then** `status` changes to `pausada` and the agent treats the campaign as if no campaign is active (returns empty from `consultar_ofertas_ativas`).
7. **Given** an active campaign is ended via "Encerrar campanha", **When** confirmed, **Then** `status` changes to `encerrada` and `fase` changes to `encerrada`; the campaign cannot be reactivated (enforce at API layer — `status: 'encerrada'` is a terminal state).

## Tasks / Subtasks

- [ ] Task 1: Activation use case (AC: #1, #2)
  - [ ] Create `apps/api/src/use-cases/campaigns/activate-campaign.ts`
  - [ ] Check for existing `ativa` campaign via `assertNoActiveCampaign(tenantId)` (introduced in Story 10.1); throw 409 if found
  - [ ] Set `campaigns.status = 'ativa'`; update `updatedAt`
  - [ ] Return updated campaign
- [ ] Task 2: Phase transition use case (AC: #3, #4, #5)
  - [ ] Create `apps/api/src/use-cases/campaigns/transition-campaign-phase.ts`
  - [ ] `transitionPhase(tenantId, campaignId, targetPhase: CampaignFase)` — validates the transition is legal (only forward transitions: `aquecimento → carrinho_aberto`, `carrinho_aberto → downsell`; `encerrada` is set by `end-campaign` use case, not here)
  - [ ] On `carrinho_aberto → downsell`: check if `config.carrinho_aberto.transicao.produto_id` is set; if so, use it as the effective product; else use the campaign's `produto_id`
  - [ ] Record a `lead_journey_events` row of `tipo: 'campanha_fase_transicao'` with `{ from, to, triggeredBy: 'manual' | 'scheduled' }` in `detalhes` (this is informational only; existing lead data does not change)
- [ ] Task 3: Scheduled phase transition BullMQ job (AC: #4)
  - [ ] Create `apps/api/src/jobs/campaign-phase-transition.ts` — BullMQ job processor
  - [ ] When a campaign's `config.*.transicao = { tipo: 'data', data: '...' }` is saved (via `PATCH /campaigns/:id`), enqueue a BullMQ delayed job: `{ campaignId, tenantId, targetPhase }` with `delay = ms(transitionDate - now())`
  - [ ] Job processor: calls `transitionPhase(tenantId, campaignId, targetPhase)` then marks job done; if campaign is no longer active when the job fires (status changed), skip gracefully with a log
  - [ ] Handle job re-scheduling: if the admin changes the transition date, cancel the old job (by job ID stored in `campaigns.config.*.scheduledJobId`) and enqueue a new one
  - [ ] Register the job processor in the BullMQ worker bootstrap
- [ ] Task 4: Pause and end campaign use cases (AC: #6, #7)
  - [ ] Create `apps/api/src/use-cases/campaigns/pause-campaign.ts` — set `status: 'pausada'`
  - [ ] Create `apps/api/src/use-cases/campaigns/end-campaign.ts` — set `status: 'encerrada'`, `fase: 'encerrada'`; return 409 if already `encerrada`
- [ ] Task 5: Campaign lifecycle API endpoints (AC: #1–#7)
  - [ ] `POST /campaigns/:id/activate` → `activate-campaign` use case
  - [ ] `POST /campaigns/:id/transition` body `{ targetPhase }` → `transition-campaign-phase` use case
  - [ ] `POST /campaigns/:id/pause` → `pause-campaign` use case
  - [ ] `POST /campaigns/:id/end` → `end-campaign` use case
  - [ ] All endpoints: RBAC `admin` or `owner`; validate campaign belongs to current tenant (RLS + explicit check)
  - [ ] Register endpoints in the campaigns router from Story 10.1
- [ ] Task 6: Campaign detail UI — lifecycle controls (AC: #1, #3, #6, #7)
  - [ ] In `apps/dashboard/app/(shell)/campanhas/[id]/page.tsx` (Story 10.1), add action buttons based on current status:
    - `rascunho`: show "Ativar campanha" (calls `/activate`)
    - `ativa + fase carrinho_aberto`: show "Iniciar downsell" (calls `/transition`)
    - `ativa`: show "Pausar campanha" (calls `/pause`) and "Encerrar campanha" (calls `/end`)
    - `pausada`: show "Reativar campanha" (calls `/activate`) and "Encerrar campanha"
    - `encerrada`: read-only, no action buttons
  - [ ] All actions require a confirmation `<Dialog>` ("Você tem certeza?") before proceeding
  - [ ] Status badge updates optimistically on mutation success; reverts on error
- [ ] Task 7: Tests (AC: #1, #2, #3, #4, #7)
  - [ ] Unit: `activate-campaign` throws 409 when another `ativa` campaign exists
  - [ ] Unit: `transition-campaign-phase` validates only forward transitions are legal
  - [ ] Unit: `end-campaign` is a terminal state — subsequent `activate` throws
  - [ ] Unit: scheduled job fires `transitionPhase` with correct args; gracefully skips if campaign no longer active
  - [ ] Integration: PATCH to update transition date cancels old BullMQ job and enqueues new one

## Dev Notes

- Files to create: `apps/api/src/use-cases/campaigns/{activate,transition,pause,end}-campaign.ts`, `apps/api/src/jobs/campaign-phase-transition.ts`.
- Files to modify: `apps/api/src/routes/campaigns/index.ts` (add lifecycle endpoints), `apps/dashboard/app/(shell)/campanhas/[id]/page.tsx` (add action buttons).
- BullMQ job scheduling: use `Queue.add(name, data, { delay, jobId })` — store `jobId` (e.g., `campaign-transition:{campaignId}:{targetPhase}`) in `campaigns.config.*.scheduledJobId` so it can be cancelled on date change.
- The "effective product" on downsell transition: the `config` jsonb can optionally contain `downsell: { produto_id: 'uuid' }` to override the campaign's main product. If absent, the main `campaigns.produto_id` remains the effective product even in the downsell phase (the agent will not re-offer to buyers thanks to `verificar_elegibilidade`).
- AC #5 is a behavioral confirmation, not new code — eligibility is already handled in Story 7.3. Just document the dependency clearly.
- **Campanhas perpétuas (`tipo: perpetuo`) não têm transição de fase.** O endpoint `POST /campaigns/:id/transition` deve retornar `400 Bad Request` com a mensagem `"Campanhas perpétuas não possuem fases de lançamento e não podem fazer transição de fase."` se o `tipo` for `perpetuo`. A UI da campanha perpétua não exibe os botões "Iniciar downsell" ou "Iniciar aquecimento".
- npm dependencies: `bullmq` (likely already present from Epic 7 queue setup) — no new packages.

### Testing standards

- Unit: Vitest, mocked DB and BullMQ queue. Assert state transitions and 409 guard.
- Integration: end-to-end state machine test: create → activate → transition → end; verify each state in DB.

### Pitfalls to avoid

- Do NOT allow multiple concurrent activations — the `assertNoActiveCampaign` guard must be atomic; use a DB transaction or rely on the partial unique index from Story 10.1.
- Do NOT run `transition-campaign-phase` outside a DB transaction — phase + product update must be atomic.
- Do NOT forget to cancel stale BullMQ jobs when transition date changes — stale jobs will fire at the old time.
- `encerrada` is terminal — do NOT allow reactivation without explicit product decision (enforce at API, not only at UI).

### References

- [Source: docs/01-leedi-arquitetura.md#6.8 Domínio Campaign]
- [Source: _bmad-output/planning-artifacts/epics.md#Story 10.2]
- [Source: _bmad-output/implementation-artifacts/10-1-campaign-crud-phase-schema.md] (schema + assertNoActiveCampaign)
- [Source: _bmad-output/implementation-artifacts/7-3-lead-context-tools-history-offers-eligibility.md] (verificar_elegibilidade — AC #5 context)

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
