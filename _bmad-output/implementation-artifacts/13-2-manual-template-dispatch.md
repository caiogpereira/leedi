---
baseline_commit: 9ea8a05
---

# Story 13.2: Manual Template Dispatch

Status: ready-for-dev

## Story

As a tenant admin,
I want to create and schedule a manual dispatch selecting a template and segment with throttling that respects Meta's tier,
so that I can reach my leads at scale without violating Meta's rate limits.

## Acceptance Criteria

1. **Given** the DB migration runs, **When** applied, **Then** tables `dispatch_jobs` and `dispatch_targets` exist with columns from Architecture §6.10: `dispatch_jobs` (`id`, `tenant_id`, `campaign_id` FK nullable, `template_id` FK nullable, `segment_id` FK nullable, `tipo` enum `template_massa|reengajamento|followup_24h`, `status` enum `agendado|processando|concluido|pausado|erro`, `agendado_para` timestamptz, `total_alvos` int, `enviados` int, `falhas` int, `config_throttle` jsonb, `created_at`, `updated_at`); `dispatch_targets` (`id`, `dispatch_job_id` FK, `lead_id` FK, `tenant_id`, `status` enum `pendente|enviado|entregue|respondido|falhou|excluido`, `motivo_exclusao` text nullable, `enviado_em` timestamptz nullable, `created_at`). RLS on both tables.
2. **Given** a tenant admin creates a dispatch job with: approved template, segment, scheduled time, **When** `POST /dispatch-jobs` is called, **Then** a `dispatch_jobs` record is created with `status: agendado` and `tipo: template_massa`.
3. **Given** the dispatch job fires at scheduled time via BullMQ, **When** the worker processes it, **Then**: (a) leads matching the segment are loaded via `evaluate-segment`; (b) exclusions are applied: leads with `comprou = true` for the associated product (if `campaign_id` is set), `optout = true`, or an active `conversation_window` (last message < 24h ago) are excluded; (c) for each included lead, a `dispatch_targets` record is created with `status: pendente`; (d) messages are sent in batches with throttling respecting `config_throttle.tier_interval_ms` between messages.
4. **Given** the tenant's WhatsApp messaging tier is 1k/day, **When** the dispatch worker runs, **Then** messages are sent with at least `tier_interval_ms` delay between each send; the tenant's messaging tier is read from `whatsapp_connections.quality_tier` and maps to the correct interval (1k tier → ~86ms/msg, 10k → ~8.6ms/msg, 100k → ~0.86ms/msg, unlimited → no enforced delay).
5. **Given** the dispatch job completes (all targets processed), **When** the final target is done, **Then** `dispatch_jobs.status` updates to `concluido` and final counts (`total_alvos`, `enviados`, `falhas`) are accurate.
6. **Given** a lead is in the segment but `comprou = true` for the dispatched product, **When** targets are built, **Then** a `dispatch_targets` record is created with `status: excluido` and `motivo_exclusao: "ja_comprou"` — the message is NOT sent.
7. **Given** a dispatch job is in `processando` status and the admin clicks "Pausar", **When** confirmed, **Then** `dispatch_jobs.status` changes to `pausado`; the BullMQ worker checks the status before each send and stops processing when `pausado` is detected.
8. **Given** a tenant admin views a completed dispatch job, **When** the detail page loads, **Then** they see: total_alvos, enviados, entregues (from delivery webhooks — Story 4.4), respondidos, falhas, excluídos — all as counts with percentage breakdowns.

## Tasks / Subtasks

- [ ] Task 1: DB schema + migration (AC: #1)
  - [ ] Create (or extend) `packages/db/src/schema/dispatch.ts`
  - [ ] Define `pgEnum('dispatch_tipo', ['template_massa', 'reengajamento', 'followup_24h'])`
  - [ ] Define `pgEnum('dispatch_status', ['agendado', 'processando', 'concluido', 'pausado', 'erro'])`
  - [ ] Define `pgEnum('dispatch_target_status', ['pendente', 'enviado', 'entregue', 'respondido', 'falhou', 'excluido'])`
  - [ ] Define `dispatch_jobs` table with all columns; `config_throttle` jsonb default `{}`; `total_alvos`, `enviados`, `falhas` default 0
  - [ ] Define `dispatch_targets` table with all columns: id, dispatch_job_id (fk), lead_id (fk), tenant_id, `dispatch_rule_id` (uuid FK nullable → `dispatch_rules.id`), status, motivo_exclusao (text nullable), `wamid` (text nullable — WhatsApp message ID retornado pela Meta), enviado_em (timestamptz nullable), created_at
  - [ ] Generate migration — **estratégia de migração**: se Stories 13.2, 13.3 e 13.4 forem implementadas na mesma sessão (antes de qualquer `db push`), criar uma única migração 0012 com todas as tabelas do domínio dispatch (`dispatch_jobs`, `dispatch_targets`, `dispatch_rules`, `followups`). Se 0012 já estiver aplicada de uma sessão anterior, criar 0013 para as tabelas restantes.
  - [ ] `ENABLE ROW LEVEL SECURITY` + `FORCE ROW LEVEL SECURITY` on both tables; tenant isolation; `updated_at` trigger on `dispatch_jobs` only (`dispatch_targets` is largely append-only except status updates)
  - [ ] Re-export from `packages/db/src/schema/index.ts`
- [ ] Task 2: Dispatch job creation use case + API (AC: #2)
  - [ ] Create `apps/api/src/use-cases/dispatch/create-dispatch-job.ts`
  - [ ] Validate: template `status` must be `aprovado`; `segment_id` must exist for tenant; `agendado_para` must be in the future
  - [ ] Compute `config_throttle`: read `whatsapp_connections.quality_tier` for the tenant; map tier to `tier_interval_ms`
  - [ ] Enqueue a BullMQ delayed job `run-dispatch-job` with `delay = agendado_para - now()`; store BullMQ job ID in `dispatch_jobs.config_throttle.bullmq_job_id`
  - [ ] `POST /dispatch-jobs` → create use case
  - [ ] `GET /dispatch-jobs` → list with pagination; filter by status
  - [ ] `GET /dispatch-jobs/:id` → detail with target counts grouped by status
  - [ ] `POST /dispatch-jobs/:id/pause` → set status to `pausado`
  - [ ] `POST /dispatch-jobs/:id/cancel` → set status to `erro` if not started; `pausado` if processing (terminal cancel = pausado for V1)
  - [ ] Register router in `apps/api/src/app.ts`
- [ ] Task 3: Dispatch BullMQ worker (AC: #3, #4, #5, #6, #7)
  - [ ] Create `apps/api/src/jobs/run-dispatch-job.ts` — BullMQ job processor
  - [ ] Fetch `dispatch_jobs` record; check `status !== 'agendado'` → skip (idempotency)
  - [ ] Set `dispatch_jobs.status = 'processando'`
  - [ ] Call `evaluate-segment(segment_id, tenantId)` to get matching lead IDs
  - [ ] For each lead, apply exclusion logic:
    - `lead.optout = true` → exclude with `motivo_exclusao: 'optout'`
    - If `campaign_id` set and lead's `produto_comprado_id` matches campaign product → exclude with `motivo_exclusao: 'ja_comprou'`
    - Active `conversation_window` (open window < 24h) → exclude with `motivo_exclusao: 'conversa_ativa'`
  - [ ] Batch-insert `dispatch_targets` for all leads (included + excluded)
  - [ ] Update `dispatch_jobs.total_alvos = count of non-excluded targets`
  - [ ] Process targets in order: for each `status: pendente` target, check `dispatch_jobs.status` (abort if `pausado`), send via `connection.enviarTemplate()`, **salvar o `wamid` retornado em `dispatch_targets.wamid`**, update `dispatch_target.status`, increment `dispatch_jobs.enviados` or `falhas`
  - [ ] Throttle: `await sleep(config_throttle.tier_interval_ms)` between each send
  - [ ] On completion: `dispatch_jobs.status = 'concluido'`
  - [ ] On unhandled error: `dispatch_jobs.status = 'erro'`, log error with Sentry
  - [ ] Register worker in BullMQ bootstrap
- [ ] Task 4: Dispatch creation + tracking UI (AC: #2, #8)
  - [ ] Create `apps/dashboard/app/(shell)/disparos/page.tsx` — dispatch jobs list
  - [ ] Create `apps/dashboard/app/(shell)/disparos/new/page.tsx` — dispatch creation form:
    - Template selector (only `status: aprovado`)
    - Segment selector
    - Date/time picker for `agendado_para` (calendar + time input; default to next available 9h-21h window)
    - Preview: "~X leads serão atingidos" (from segment preview)
  - [ ] Create `apps/dashboard/app/(shell)/disparos/[id]/page.tsx` — dispatch detail:
    - Status badge + progress bar (enviados / total_alvos)
    - Counts table: Alcançados, Enviados, Entregues, Respondidos, Falhos, Excluídos
    - Pause button (if `processando`)
    - Auto-refresh every 10s while status is `processando`
- [ ] Task 5: Tests (AC: #2, #3, #6, #7)
  - [ ] Unit: `create-dispatch-job` rejects templates with `status !== 'aprovado'`
  - [ ] Unit: dispatch worker applies all 3 exclusion types correctly
  - [ ] Unit: dispatch worker stops processing when `status: pausado` detected
  - [ ] Unit: throttle delay called between each send
  - [ ] Integration: create dispatch → BullMQ job fires → targets created + messages sent (mocked WhatsApp provider)

## Dev Notes

- Files to create: `packages/db/src/schema/dispatch.ts`, migration file (0012), `apps/api/src/routes/dispatch-jobs/index.ts`, `apps/api/src/use-cases/dispatch/create-dispatch-job.ts`, `apps/api/src/jobs/run-dispatch-job.ts`, dispatch UI pages.
- Files to modify: `packages/db/src/schema/index.ts`, `apps/api/src/app.ts`, dashboard sidebar (add Disparos link).
- **Tier interval mapping** (baseado nos limites da Meta — contatos únicos por dia): use a tabela abaixo para definir `config_throttle.tier_interval_ms`:
  | Tier Meta | Intervalo por msg | Lógica |
  |-----------|-------------------|--------|
  | 1k/dia    | 1.000ms (1 msg/s) | 1k leads em ~17 min |
  | 10k/dia   | 500ms             | 10k leads em ~1,4h |
  | 100k/dia  | 100ms             | 100k leads em ~2,8h |
  | Ilimitado | 50ms              | Sem cap diário |
- Message delivery status updates (`entregue`, `respondido`) come from the Meta webhook handler (Story 4.4) via message status webhooks. When Meta sends a `messages[*].status = "delivered"` webhook, look up the `dispatch_targets` record via `dispatch_targets.wamid = messages[*].id` and update status to `entregue`. Wire this linkage in Story 4.4 if not already done.
- **NFR6 — Quality gate**: a Story 13.5 implementa a pausa automática de dispatches quando o quality rating cai para RED. Ao implementar o dispatch worker, verificar também se `whatsapp_connections.quality_tier = 'red'` antes de iniciar o processamento (early abort).
- `connection.enviarTemplate()` from the `@leedi/connection` package is implemented in Story 4.5. Confirm the method signature is compatible.
- BullMQ job for dispatch: use `jobId: dispatch-${dispatchJobId}` to prevent duplicate scheduling.
- For large segments (10k+ leads), batch-insert `dispatch_targets` in chunks of 500 to avoid DB timeouts.
- npm dependencies: `bullmq` (already present).

### Testing standards

- Unit tests: Vitest, mocked DB + BullMQ + WhatsApp provider. Test exclusion logic, throttling, and pause detection.
- Integration: create a small segment (10 leads), run dispatch job, verify `dispatch_targets` created with correct statuses.

### Pitfalls to avoid

- Do NOT send to excluded leads — the `motivo_exclusao` field must be set BEFORE any send attempt.
- Do NOT skip the `status: pausado` check inside the send loop — check on every iteration.
- Do NOT count excluded targets in `total_alvos` — only count targets that will actually be sent.
- Confirm migration 0012 is free at implementation time.

### References

- [Source: docs/01-leedi-arquitetura.md#6.10 Domínio Dispatch]
- [Source: _bmad-output/planning-artifacts/epics.md#Story 13.2]
- [Source: _bmad-output/implementation-artifacts/13-1-lead-segment-builder.md] (evaluate-segment use case)
- [Source: _bmad-output/implementation-artifacts/4-5-outbound-message-sending-via-meta-cloud-api.md] (connection.enviarTemplate)
- [Source: _bmad-output/implementation-artifacts/12-1-template-builder-meta-submission.md] (templates table, approved status)

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
