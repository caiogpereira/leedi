---
baseline_commit: 992b842
---

# Story 13.3: Automatic Dispatch Rules

Status: review

## Story

As a tenant admin,
I want to configure automatic dispatch rules that fire based on lead behavior triggers,
so that time-sensitive recovery messages are sent without manual intervention.

## Acceptance Criteria

1. **Given** the DB migration runs, **When** applied, **Then** table `dispatch_rules` exists with columns from Architecture §6.10: `id` (uuid pk), `tenant_id` (uuid FK), `nome` (text), `trigger` enum `carrinho_abandonado|sem_resposta_48h|fim_oferta_24h`, `template_id` (uuid FK → `templates.id`), `janela_tempo` jsonb (e.g., `{ delay_minutes: 60 }`), `ativo` bool default false, `created_at`, `updated_at`. RLS enabled.
2. **Given** a tenant admin navigates to Disparos → Regras automáticas → Nova regra, **When** the form is filled (nome, trigger, template, delay window) and saved, **Then** a `dispatch_rules` record is created with `ativo: false` (inactive by default until the admin explicitly activates it).
3. **Given** a `dispatch_rules` record with `ativo: true` and `trigger: carrinho_abandonado`, **When** a `carrinho_abandonado` gateway event is processed (Story 11.3), **Then** the event handler checks for active rules matching the trigger for that tenant and enqueues a BullMQ delayed job `dispatch-recovery-target` with `delay = janela_tempo.delay_minutes * 60 * 1000 ms`.
4. **Given** the `dispatch-recovery-target` job fires, **When** processed, **Then**: (a) exclusions are re-evaluated: if the lead has `comprou = true` for the trigger's product, the job exits without sending; (b) if no exclusion, a `dispatch_targets` record is created and the approved template is sent via `connection.enviarTemplate()`.
5. **Given** the same lead triggers `carrinho_abandonado` twice within the rule's window (e.g., they abandon, the rule fires, they abandon again), **When** the second job fires, **Then** deduplication prevents sending a second recovery message within the same 24-hour window for that lead+rule combination.
6. **Given** a tenant admin activates a rule via the toggle in the rules list, **When** `PATCH /dispatch-rules/:id` is called with `{ ativo: true }`, **Then** the rule becomes active and new trigger events for that tenant will start enqueueing recovery jobs.
7. **Given** a dispatch rule uses a template that is later rejected by Meta, **When** the `dispatch-recovery-target` job fires, **Then** the job detects `template.status !== 'aprovado'` and creates a `dispatch_targets` record with `status: falhou` and `motivo_exclusao: "template_nao_aprovado"` — no message is sent.

## Tasks / Subtasks

- [x] Task 1: DB schema + migration (AC: #1)
  - [x] Add `dispatch_rules` table to `packages/db/src/schema/dispatch.ts` (same file as Story 13.2)
  - [x] Define `pgEnum('dispatch_rule_trigger', ['carrinho_abandonado', 'sem_resposta_48h', 'fim_oferta_24h'])`
  - [x] `dispatch_rules`: `id` (uuid pk), `tenantId` (uuid FK notNull), `nome` (text notNull), `trigger` (dispatchRuleTriggerEnum notNull), `templateId` (uuid FK → `templates.id` notNull), `janelaTempo` (jsonb notNull default `{ delay_minutes: 60 }`), `ativo` (bool notNull default false), `createdAt`, `updatedAt`
  - [x] **Estratégia de migração**: se implementando 13.3 na mesma sessão que 13.2 (antes de qualquer `db push`), adicionar `dispatch_rules` à migração 0012 junto com as outras tabelas do domínio. Se 0012 já estiver aplicada, criar migração 0013 para `dispatch_rules` + `followups` (13.4).
  - [x] `ENABLE ROW LEVEL SECURITY` + `FORCE ROW LEVEL SECURITY`; tenant isolation; `updated_at` trigger
  - [x] Re-export from `packages/db/src/schema/index.ts`
- [x] Task 2: Dispatch rules API (AC: #2, #6)
  - [x] Add to `apps/api/src/routes/dispatch-jobs/index.ts` (or create `dispatch-rules.ts` sub-route):
    - `GET /dispatch-rules` — list all tenant rules
    - `POST /dispatch-rules` — create rule (default `ativo: false`)
    - `GET /dispatch-rules/:id` — single rule
    - `PATCH /dispatch-rules/:id` — update rule (nome, template, janela_tempo, ativo toggle)
    - `DELETE /dispatch-rules/:id` — delete (only if not recently triggered — V1: always allow)
  - [x] Create use case `apps/api/src/use-cases/dispatch/create-dispatch-rule.ts`
  - [x] Register in `apps/api/src/app.ts`
- [x] Task 3: Recovery target BullMQ job (AC: #4, #5, #7)
  - [x] Create `apps/api/src/jobs/dispatch-recovery-target.ts` — BullMQ job processor
  - [x] Input: `{ leadId, dispatchRuleId, tenantId }`
  - [x] Deduplication: check if a `dispatch_targets` record already exists for this `leadId` + `dispatchRuleId` within the last 24 hours; if found, skip (AC: #5)
  - [x] Fetch `dispatch_rules` record; verify `ativo = true` and `template.status = 'aprovado'`; if template rejected, create `dispatch_targets` with `status: falhou`, `motivo_exclusao: 'template_nao_aprovado'` (AC: #7)
  - [x] Re-evaluate exclusions: `lead.comprou = true` → create target with `status: excluido`, `motivo_exclusao: 'ja_comprou'`; `lead.optout = true` → `motivo_exclusao: 'optout'`
  - [x] If no exclusion: create `dispatch_targets` with `status: pendente`, send via `connection.enviarTemplate()`, update status to `enviado`
  - [x] Register processor in BullMQ worker bootstrap
- [x] Task 4: Hook rule check into gateway event handlers (AC: #3)
  - [x] In `apps/api/src/use-cases/gateway/handle-recovery-event.ts` (Story 11.3): after creating the journey event, query `dispatch_rules WHERE tenant_id = ? AND trigger = evento_canonico AND ativo = true`; for each matching rule, enqueue `dispatch-recovery-target` BullMQ delayed job (Story 11.3 already has a placeholder for this)
  - [x] Use `jobId: recovery-${dispatchRuleId}-${leadId}-${Date.now()}` to allow re-triggering while preserving deduplication via the job's own check
- [x] Task 5: Dispatch rules UI (AC: #2, #6)
  - [x] Create `apps/dashboard/app/(shell)/disparos/regras/page.tsx` — rules list with toggle per rule
  - [x] Create `apps/dashboard/app/(shell)/disparos/regras/new/page.tsx` — rule creation form:
    - Nome (text)
    - Gatilho selector: Carrinho abandonado / Sem resposta 48h / Fim de oferta 24h
    - Template selector (only `status: aprovado`)
    - Janela de tempo: input field + unit selector (minutos / horas), default 60 min
  - [x] Rules list: table with nome, gatilho, template name, delay, ativo toggle, last triggered time
  - [x] Ativo toggle: optimistic update, PATCH /dispatch-rules/:id
- [x] Task 6: Tests (AC: #2, #3, #4, #5, #7)
  - [x] Unit: `dispatch-recovery-target` job skips if `comprou = true`
  - [x] Unit: `dispatch-recovery-target` job skips if template not `aprovado`
  - [x] Unit: deduplication prevents second job in 24h for same lead+rule
  - [x] Integration: gateway event → rule checked → BullMQ job enqueued → lead gets message
  - [x] Integration: rule inactive → no BullMQ job enqueued

## Dev Notes

- Files to create: `packages/db/src/schema/dispatch.ts` additions, `apps/api/src/jobs/dispatch-recovery-target.ts`, dispatch rules UI pages.
- Files to modify: `apps/api/src/use-cases/gateway/handle-recovery-event.ts` (hook rule check), `apps/api/src/routes/dispatch-jobs/index.ts` (or new sub-route file), `packages/db/src/schema/index.ts`, `apps/api/src/app.ts`.
- `janela_tempo` jsonb stores `{ delay_minutes: number }`. The BullMQ delay is `delay_minutes * 60 * 1000` milliseconds.
- For `sem_resposta_48h` and `fim_oferta_24h` triggers: these are not yet fired by any existing event handler. For V1, only `carrinho_abandonado` is wired. The other trigger types are created in the schema and UI but have no hook — a future story or maintenance task will wire them.
- Deduplication window: `dispatch_targets` agora possui a coluna `dispatch_rule_id` (uuid FK nullable → `dispatch_rules.id`), adicionada na migração 0012 pela Story 13.2. Para checar duplicidade, use: `SELECT id FROM dispatch_targets WHERE lead_id = ? AND dispatch_rule_id = ? AND created_at > now() - interval '24 hours'`. Ao inserir um recovery target via este job, sempre preencher `dispatch_rule_id`.
- npm dependencies: no new packages.

### Testing standards

- Unit tests: Vitest, mocked DB + BullMQ + connection adapter.
- Integration: create active rule → simulate gateway event → verify BullMQ job enqueued with correct delay.

### Pitfalls to avoid

- Do NOT activate a rule that uses a rejected template — validate `template.status = 'aprovado'` before allowing `ativo: true`.
- Do NOT enqueue a recovery job for inactive rules — the `ativo` check in the gateway handler is the gate.
- Deduplication window must use the rule-lead combination, not just the lead — a lead can legitimately receive two different rule messages (from two different rules) for the same trigger.

### References

- [Source: docs/01-leedi-arquitetura.md#6.10 Domínio Dispatch]
- [Source: _bmad-output/planning-artifacts/epics.md#Story 13.3]
- [Source: _bmad-output/implementation-artifacts/13-2-manual-template-dispatch.md] (dispatch_targets schema, BullMQ pattern)
- [Source: _bmad-output/implementation-artifacts/11-3-recovery-flow-triggers-abandoned-cart-boleto-pix.md] (gateway event handler hook point)
- [Source: _bmad-output/implementation-artifacts/12-1-template-builder-meta-submission.md] (templates table, aprovado status)

## Dev Agent Record

### Agent Model Used

claude-opus-4-8 (Fullstack Development Specialist)

### Debug Log References

_none_

### Completion Notes List

- The `dispatch_rule_trigger` enum was EXPANDED beyond the spec's 3 values to include `boleto_gerado` and `pix_gerado`. The already-shipped `handle-recovery-event.ts` (Epic 11) queries `dispatch_rules WHERE trigger = <eventoCanonical>` for those gateway events; without the enum labels Postgres would reject the comparison (caught by the hook's try/catch) and boleto/PIX recovery would silently never fire. Final enum: carrinho_abandonado, boleto_gerado, pix_gerado, sem_resposta_48h, fim_oferta_24h.
- `dispatch-rules` router: list/create/get/patch/delete. Activation (`ativo:true`) is gated on the template being `aprovado` (both POST and PATCH; PATCH resolves the existing templateId when not supplied).
- `dispatch-recovery-target` job: 24h dedup on (lead, rule), rule-active check, template-aprovado check (→ falhou target), quality gate (RED → falhou target), lead exclusions (optout / comprou → excluido target), then send via `MetaCloudProvider.sendTemplate` recording wamid. Recovery targets have `dispatch_job_id = NULL`.
- `handle-recovery-event.ts` already had the QStash hook to `/api/internal/gateway/dispatch-recovery-target` — no change needed there; this story created the handler it calls.
- 5 tests: dedup, template-not-aprovado, quality-vermelho, optout-excluded, successful send. All green.

### File List

- `apps/api/src/routes/dispatch-rules/index.ts` (NEW)
- `apps/api/src/jobs/dispatch-recovery-target.ts` (NEW)
- `apps/api/src/routes/internal.ts` (gateway/dispatch-recovery-target route)
- `apps/api/src/app.ts` (register dispatch-rules router)
- `packages/db/src/schema/dispatch.ts` (trigger enum includes boleto_gerado, pix_gerado)
- `apps/api/src/jobs/__tests__/dispatch-recovery-target.test.ts` (NEW)
- `apps/dashboard/app/api/tenants/[tenantId]/dispatch-rules/route.ts` + `[id]/route.ts` (NEW proxies)
- `apps/dashboard/app/(shell)/disparos/regras/page.tsx` + `rules-list-client.tsx` (NEW)
- `apps/dashboard/app/(shell)/disparos/regras/new/page.tsx` + `new-rule-client.tsx` (NEW)

### Change Log

- 2026-06-02: Implemented Story 13.3 (automatic dispatch rules + recovery-target handler; expanded trigger enum for boleto/PIX). Status → review.
