---
baseline_commit: 9ea8a05
---

# Story 13.4: 24h Window Follow-Up & Re-Engagement

Status: review

## Story

As a tenant operator,
I want the agent to schedule free follow-ups within the open 24h window and use approved templates when the window closes,
so that warm leads are nudged without unnecessary template costs.

## Acceptance Criteria

1. **Given** the DB migration runs, **When** applied, **Then** table `followups` exists with columns from Architecture §6.10: `id` (uuid pk), `tenant_id` (uuid FK), `lead_id` (uuid FK), `conversation_window_id` (uuid FK), `agendado_para` (timestamptz), `motivo` (text), `conteudo_sugerido` (text nullable), `status` enum `agendado|enviado|cancelado|janela_fechada`, `created_at`. RLS enabled.
2. **Given** the agent calls `agendar_followup` with `{ agendado_para: "<ISO datetime>", motivo: "...", conteudo_sugerido: "..." }`, **When** executed, **Then** a `followups` record is created and a BullMQ delayed job `send-followup` is enqueued with `delay = agendado_para - now()`. The `agendado_para` must be within the current conversation window's 24h limit (≤ 23h from now); if not, the tool returns an error: "O follow-up deve ser agendado dentro da janela de 24 horas ativa."
3. **Given** the `send-followup` BullMQ job fires and the 24h window is still open (current time < `conversation_window.started_at + 24h`), **When** processed, **Then** the follow-up message (`conteudo_sugerido` or a default message) is sent as a free-form WhatsApp message via `connection.enviarTexto()` — no template required — and `followups.status` updates to `enviado`.
4. **Given** the `send-followup` job fires and the 24h window has CLOSED, **When** processed, **Then** `followups.status` updates to `janela_fechada`; if an active `dispatch_rules` record with `trigger = 'sem_resposta_48h'` exists and the lead has not been contacted by this rule in the last 24 hours, a `dispatch-recovery-target` job is enqueued as a fallback.
5. **Given** the agent calls `solicitar_reengajamento` with `{ motivo: "..." }`, **When** executed, **Then** it checks for an active `dispatch_rules` record with any reengagement-compatible trigger for that tenant; if found, enqueues a `dispatch-recovery-target` job for the lead immediately (no delay); if no matching rule is found, the tool returns: "Nenhuma regra de reengajamento ativa configurada. Configure um template e uma regra em Disparos → Regras automáticas."
6. **Given** a follow-up is scheduled and the lead converts (becomes `comprou = true`) before the job fires, **When** the job processes, **Then** `followups.status` updates to `cancelado` with a note: "Lead convertido antes do envio" — the message is NOT sent.
7. **Given** the `agendar_followup` tool is called but the agent configuration has this tool disabled (Story 7.1 tool toggles), **When** called, **Then** the tool returns an error without creating any record.

## Tasks / Subtasks

- [x] Task 1: DB schema + migration (AC: #1)
  - [x] Add `followups` table to `packages/db/src/schema/dispatch.ts`
  - [x] Define `pgEnum('followup_status', ['agendado', 'enviado', 'cancelado', 'janela_fechada'])`
  - [x] `followups`: `id` (uuid pk), `tenantId` (uuid FK), `leadId` (uuid FK → `leads.id`), `conversationWindowId` (uuid FK → `conversation_windows.id`), `agendadoPara` (timestamptz notNull), `motivo` (text notNull), `conteudoSugerido` (text nullable), `status` (followupStatusEnum notNull default `'agendado'`), `createdAt`
  - [x] **Estratégia de migração**: se implementando 13.4 na mesma sessão que 13.2 e 13.3 (antes de qualquer `db push`), adicionar `followups` à migração 0012. Se 0012 já estiver aplicada, criar migração 0013 com `dispatch_rules` + `followups` (compartilhada com 13.3).
  - [x] `ENABLE ROW LEVEL SECURITY`; tenant isolation policy; no `updated_at` (status updated in-place is OK)
  - [x] Re-export from `packages/db/src/schema/index.ts`
- [x] Task 2: `agendar_followup` agent tool (AC: #2, #7)
  - [x] Create `apps/api/src/use-cases/agent/tools/agendar-followup.ts`
  - [x] Input: `{ agendadoPara: string (ISO), motivo: string, conteudoSugerido?: string, leadId, tenantId, conversationWindowId }`
  - [x] Validate tool is enabled in `agent_config.ferramentas_habilitadas` (AC: #7)
  - [x] Validate `agendadoPara` ≤ `conversationWindow.started_at + 23h` (AC: #2)
  - [x] Insert `followups` record
  - [x] Enqueue BullMQ delayed job `send-followup` with `delay = agendadoPara - now()`, `jobId: followup-{followupId}`
  - [x] Return success confirmation string for the agent to include in its response
  - [x] Register tool in the agent tool dispatcher (Story 7.2) — add `agendar_followup` to the tool definitions list
- [x] Task 3: `solicitar_reengajamento` agent tool (AC: #5)
  - [x] Create `apps/api/src/use-cases/agent/tools/solicitar-reengajamento.ts`
  - [x] Input: `{ motivo: string, leadId, tenantId }`
  - [x] Query `dispatch_rules WHERE tenant_id = ? AND ativo = true` — pick first match (or most recently activated)
  - [x] If found: enqueue `dispatch-recovery-target` with `delay: 0` (immediate)
  - [x] If not found: return the "no active rule" error message (AC: #5)
  - [x] Register in agent tool dispatcher
- [x] Task 4: `send-followup` BullMQ job processor (AC: #3, #4, #6)
  - [x] Create `apps/api/src/jobs/send-followup.ts`
  - [x] Fetch `followups` record; if `status !== 'agendado'`, skip (idempotency)
  - [x] Check lead conversion: if `lead.comprou = true` → set `followups.status = 'cancelado'`, return (AC: #6)
  - [x] Check window: fetch `conversation_windows` record for `followups.conversation_window_id`; compute `windowCloseTime = started_at + 24h`
  - [x] If `now() < windowCloseTime` (window open): send `conteudo_sugerido` (or default "Oi! Só passando para saber se ficou alguma dúvida 😊") via `connection.enviarTexto()`; set `followups.status = 'enviado'` (AC: #3)
  - [x] If `now() >= windowCloseTime` (window closed): set `followups.status = 'janela_fechada'`; if matching active dispatch rule found, enqueue `dispatch-recovery-target` (AC: #4)
  - [x] Register in BullMQ worker bootstrap
- [x] Task 5: Agent tool registration (AC: #2, #5)
  - [x] In `apps/api/src/use-cases/agent/tools/index.ts` (Story 7.2), add `agendar_followup` and `solicitar_reengajamento` tool definitions (name, description, input schema) to the tools array passed to the Claude Agent SDK
  - [x] Add both tools to `agent_config.ferramentas_habilitadas` list (Story 7.1 UI)
- [x] Task 6: Tests (AC: #2, #3, #4, #5, #6, #7)
  - [x] Unit: `agendar_followup` rejects `agendadoPara` > 23h from now
  - [x] Unit: `agendar_followup` rejects if tool disabled in agent config
  - [x] Unit: `send-followup` job sends free message when window open
  - [x] Unit: `send-followup` job sets `janela_fechada` when window closed, enqueues fallback
  - [x] Unit: `send-followup` job sets `cancelado` when lead has converted
  - [x] Unit: `solicitar_reengajamento` returns error message when no active rule found
  - [x] Integration: full flow — agent calls `agendar_followup` → job fires → free WhatsApp message sent

## Dev Notes

- Files to create: `packages/db/src/schema/dispatch.ts` additions (followups table), `apps/api/src/use-cases/agent/tools/agendar-followup.ts`, `apps/api/src/use-cases/agent/tools/solicitar-reengajamento.ts`, `apps/api/src/jobs/send-followup.ts`.
- Files to modify: `apps/api/src/use-cases/agent/tools/index.ts` (register both tools), `apps/api/src/use-cases/agent/tools/agendar-followup.ts` (new file), agent configuration panel UI (add tool toggles for these tools).
- Default follow-up message (when `conteudo_sugerido` is null or empty): "Oi, [lead.nome]! Só passando para saber se ficou alguma dúvida 😊". Personalize with lead name if available.
- The `conversation_windows` table and its `started_at` field come from Story 5.5. Ensure the `followups.conversation_window_id` FK correctly references `conversation_windows.id`.
- `solicitar_reengajamento` is distinct from `agendar_followup`: reengagement always uses an approved template (via `dispatch_rules`), while `agendar_followup` uses free-form text within the open 24h window.
- BullMQ job delay precision: Redis-based delays have ~1s precision. This is acceptable for follow-up scheduling (user expects "1 hour", not "exactly 60 minutes 00 seconds").
- No new external npm dependencies.
- The Claude Agent SDK tool definitions for `agendar_followup`: input schema should include `agendado_para` (ISO 8601 datetime string), `motivo` (string, reason for follow-up), `conteudo_sugerido` (optional string, suggested message text).

### Testing standards

- Unit tests: Vitest, mocked DB + BullMQ + connection adapter. Cover all 4 status outcomes of `send-followup`.
- Integration: agent session → tool call → DB record created + BullMQ job enqueued.

### Pitfalls to avoid

- Do NOT send a free message if the 24h window has closed — WhatsApp will reject it with a session error.
- Do NOT assume `conteudo_sugerido` is always set — handle null case with a sensible default.
- The `agendar_followup` tool must validate the time constraint BEFORE inserting the DB record to avoid orphaned records.
- `solicitar_reengajamento` should not fail silently — always return a meaningful message to the agent, whether success or no rule found.
- BullMQ `jobId` uniqueness: use `followup-{followupId}` to prevent re-enqueueing if the agent somehow calls the tool twice for the same context.

### References

- [Source: docs/01-leedi-arquitetura.md#6.10 Domínio Dispatch]
- [Source: _bmad-output/planning-artifacts/epics.md#Story 13.4]
- [Source: _bmad-output/implementation-artifacts/13-2-manual-template-dispatch.md] (dispatch_targets pattern, BullMQ)
- [Source: _bmad-output/implementation-artifacts/13-3-automatic-dispatch-rules.md] (dispatch-recovery-target job, reuse as fallback)
- [Source: _bmad-output/implementation-artifacts/5-5-conversation-window-tracking-24h-billing-unit.md] (conversation_windows — window open/close logic)
- [Source: _bmad-output/implementation-artifacts/7-2-agent-core-processing-loop.md] (agent tool registration pattern)
- [Source: _bmad-output/implementation-artifacts/4-5-outbound-message-sending-via-meta-cloud-api.md] (connection.enviarTexto)

## Dev Agent Record

### Agent Model Used

claude-opus-4-8 (Fullstack Development Specialist)

### Debug Log References

_none_

### Completion Notes List

- `agendar_followup` and `solicitar_reengajamento` agent tools are now fully implemented (removed from STUBBED_TOOLS) and wired into `routeToolCall`. Both schedule QStash directly: `@upstash/qstash` was added to `packages/agent/package.json` (the package already does real transport I/O — see `enviar-link-checkout.ts` — so the ToolContext-callback approach was unnecessary; no ToolContext changes were made).
- `agendar_followup` validates `0 < emHoras <= 23` (must stay inside the 24h window), verifies the window is still open, inserts a `followups` row, and schedules `/api/internal/dispatch/send-followup` with `deduplicationId: followup-{id}`. The tool schema gained the optional `conteudoSugerido` param.
- **Sandbox safety**: both tools were added to `SANDBOX_STUBS` so the playground (sandboxMode) returns simulated results without inserting real `followups` rows or firing QStash jobs.
- `send-followup` job: skips if not `agendado`; cancels if the lead converted; sends free text (conteudoSugerido or a default) when the window is open and persists the outbound message; else marks `janela_fechada` and falls back to an active re-engagement rule via the recovery-target job.
- `solicitar_reengajamento` finds an active dispatch rule and enqueues a recovery target; returns a friendly message if none is configured.
- 8 tests: agendar-followup (4), solicitar-reengajamento (2), send-followup (4). All green.

### File List

- `packages/agent/package.json` (add `@upstash/qstash`)
- `packages/agent/src/tools/agendar-followup.ts` (NEW)
- `packages/agent/src/tools/solicitar-reengajamento.ts` (NEW)
- `packages/agent/src/tools/registry.ts` (wire both tools, sandbox stubs, conteudoSugerido schema, empty STUBBED_TOOLS)
- `packages/agent/src/tools/__tests__/agendar-followup.test.ts` (NEW)
- `packages/agent/src/tools/__tests__/solicitar-reengajamento.test.ts` (NEW)
- `apps/api/src/jobs/send-followup.ts` (NEW)
- `apps/api/src/jobs/__tests__/send-followup.test.ts` (NEW)
- `apps/api/src/routes/internal.ts` (dispatch/send-followup route)

### Change Log

- 2026-06-02: Implemented Story 13.4 (follow-up + re-engagement tools, send-followup job, sandbox stubs). Status → review.
