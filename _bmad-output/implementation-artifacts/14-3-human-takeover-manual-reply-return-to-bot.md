---
baseline_commit: 9ea8a05
---

# Story 14.3: Human Takeover, Manual Reply & Return to Bot

Status: ready-for-dev

## Story

As a tenant operator,
I want to take over a conversation, send manual replies, and return control to the bot when done,
so that I can provide high-touch support without breaking the conversation flow.

## Acceptance Criteria

1. **Given** an operator is viewing a conversation detail with `inbox_assignments.status = 'aguardando_humano'`, **When** they click "Assumir atendimento" and confirm the dialog, **Then** a `PATCH /api/inbox/:conversationWindowId/assign` call sets `inbox_assignments.status = 'em_atendimento'` and `assigned_to = current_user_id`, and the `agent_threads` record for that `conversation_window_id` is set to `status: 'pausado'` via the `@leedi/agent-memory` package.
2. **Given** `inbox_assignments.status = 'bot'` (agent active, no human transfer requested), **When** an operator views the conversation detail, **Then** the "Assumir atendimento" button is still visible but shows a confirmation warning: "O agente está ativo. Ao assumir, o atendimento será pausado até você devolver ao bot."
3. **Given** `inbox_assignments.status = 'em_atendimento'`, **When** the operator types in the reply field and clicks "Enviar", **Then** the message is sent to the lead via Meta Cloud API using `@leedi/connection`'s `enviarTexto()` method AND saved in `messages` with `autor: 'humano'`, `direction: 'outbound'`, `tenant_id`, `conversation_window_id`, `lead_id`.
4. **Given** the human reply is sent, **When** the agent processes a new inbound message from the lead while `inbox_assignments.status = 'em_atendimento'`, **Then** the agent use case (Story 7.2) checks `inbox_assignments.status` for that window — if `em_atendimento`, it skips processing and does NOT call the Agent SDK. The inbound message is still saved to `messages`.
5. **Given** the operator clicks "Devolver ao bot" and confirms, **When** executed, **Then** `inbox_assignments.status` changes to `bot`, `assigned_to` is set to null, and `agent_threads.status` reverts to `ativo` for that `conversation_window_id` via `@leedi/agent-memory`.
6. **Given** `inbox_assignments.status = 'em_atendimento'` or `aguardando_humano`, **When** the operator clicks "Marcar como resolvido", **Then** `inbox_assignments.status` changes to `resolvido`, agent thread is set to `encerrado`, and the conversation no longer appears in the default (non-resolved) inbox view.
7. **Given** the `@leedi/notification` package's stub `notification.send()` port exists (per project decision), **When** `inbox_assignments.status` changes to `aguardando_humano` (from Story 7.6 `transferir_humano` tool), **Then** `notification.send({ tipo: 'lead_pediu_humano', tenantId, userId: 'all_operators', titulo: 'Lead aguardando atendimento', corpo: lead.nome })` is called via the stub. The stub logs the call but does not deliver (Epic 18 will replace the stub with real delivery).
8. **Given** a reply is typed and "Enviar" is clicked, **When** the Meta Cloud API returns an error (e.g., 24h window closed), **Then** the UI shows an inline error: "Não foi possível enviar: a janela de 24h está fechada. Use um template aprovado para reabrir."

## Tasks / Subtasks

- [ ] Task 1: Notification port stub in `@leedi/notification` (AC: #7)
  - [ ] Create `packages/notification/src/index.ts` with `NotificationPort` interface: `send(payload: NotificationPayload): Promise<void>`
  - [ ] `NotificationPayload = { tipo: string; tenantId: string; userId: string | 'all_operators'; titulo: string; corpo: string; canal?: 'push' | 'email' | 'both' }`
  - [ ] Export `createNotificationStub()` factory that returns a no-op implementation logging to `console.info('[notification:stub]', payload)`
  - [ ] Export `package.json` pointing to `src/index.ts`
  - [ ] Add `@leedi/notification` to `pnpm-workspace.yaml` if not already present
- [ ] Task 2: API routes — takeover, reply, return to bot, resolve (AC: #1, #3, #5, #6)
  - [ ] `PATCH /api/inbox/:windowId/assign` — body: `{ action: 'takeover' | 'return_to_bot' | 'resolve' }`
    - `takeover`: set `inbox_assignments.status = 'em_atendimento'`, `assigned_to = session.userId`; pause agent thread via `@leedi/agent-memory`
    - `return_to_bot`: set `status = 'bot'`, `assigned_to = null`; reactivate agent thread
    - `resolve`: set `status = 'resolvido'`; close agent thread
  - [ ] `POST /api/inbox/:windowId/reply` — body: `{ content: string }`
    - Validate `inbox_assignments.status === 'em_atendimento'`
    - Call `connection.enviarTexto()` with tenant's active WhatsApp connection
    - Insert into `messages` (`autor: 'humano'`, `direction: 'outbound'`, `tipo: 'texto'`)
    - Return inserted message or error (AC #8)
- [ ] Task 3: UI — takeover, reply, return-to-bot actions (AC: #1, #2, #3, #5, #6, #8)
  - [ ] In `apps/dashboard/app/(dashboard)/conversas/[windowId]/page.tsx`:
    - "Assumir atendimento" button (visible when status ≠ `resolvido`); shows warning dialog when `status = 'bot'` (AC #2)
    - "Devolver ao bot" button (visible when status = `em_atendimento`)
    - "Marcar como resolvido" button (visible when status = `em_atendimento` | `aguardando_humano`)
  - [ ] Reply composer: textarea + "Enviar" button; visible only when `status = 'em_atendimento'` and `assigned_to === currentUserId`
  - [ ] Inline error display for send failures (AC #8)
  - [ ] Optimistic update: add message bubble immediately, revert on error
- [ ] Task 4: Agent use-case guard (AC: #4)
  - [ ] In `apps/api/src/use-cases/agent/process-message.ts` (Story 7.2):
    - Before invoking Agent SDK, query `inbox_assignments` for the `conversation_window_id`
    - If `status === 'em_atendimento'`: skip Agent SDK, save inbound message to `messages`, return early
    - Log: `'[agent] skipped: conversation in human takeover'`
- [ ] Task 5: Wire notification stub to `transferir_humano` (AC: #7)
  - [ ] In `apps/api/src/use-cases/agent/tools/transferir-humano.ts` (Story 7.6), import `@leedi/notification` and call `notification.send({ tipo: 'lead_pediu_humano', ... })` after setting `inbox_assignments.status = 'aguardando_humano'`
- [ ] Task 6: Tests (AC: #1, #3, #4, #5, #7, #8)
  - [ ] Unit: `takeover` action sets correct status and pauses agent thread
  - [ ] Unit: `return_to_bot` reactivates agent thread
  - [ ] Unit: reply route sends message AND inserts to DB
  - [ ] Unit: agent use case skips processing when `em_atendimento`
  - [ ] Unit: notification stub logs call without throwing
  - [ ] Unit: reply route returns structured error when Meta API fails

## Dev Notes

- **Files to create:** `packages/notification/src/index.ts`, `packages/notification/package.json`, `apps/api/src/routes/inbox-actions.ts` (or extend `inbox.ts`), new components inside `conversas/[windowId]/`
- **Files to modify:** `apps/api/src/use-cases/agent/process-message.ts` (add inbox status guard), `apps/api/src/use-cases/agent/tools/transferir-humano.ts` (add notification call), `apps/api/src/app.ts` (register new routes), `pnpm-workspace.yaml` (add `packages/notification`)
- **Agent thread pause/resume:** `@leedi/agent-memory` must expose `pauseThread(conversationWindowId)` and `resumeThread(conversationWindowId)` use cases. These update `agent_threads.status`. If those methods don't exist yet, create them in this story.
- **Reply authorization:** Only the operator with `assigned_to = currentUserId` (or owner/admin) should be able to send replies. Apply RBAC check using `@leedi/auth` RBAC helpers.
- **WhatsApp connection lookup:** The `POST /api/inbox/:windowId/reply` route must resolve the tenant's active `whatsapp_connections` record to get the connection for `enviarTexto()`.
- **Notification stub in Task 5:** The stub call must not throw — wrap in `try/catch` so a notification failure never breaks the `transferir_humano` tool execution.
- **No new npm packages** beyond existing stack.

### Testing standards

- Vitest unit tests with mocked DB + mocked `@leedi/connection` adapter + mocked `@leedi/agent-memory`.
- Test the status guard in `process-message.ts` independently — it must not touch Agent SDK at all when `em_atendimento`.

### Pitfalls to avoid

- Do NOT allow reply when `status !== 'em_atendimento'` — validate server-side, not just client-side.
- Do NOT forget to pause the agent thread (not just the inbox status) — if only `inbox_assignments.status` is set and agent thread remains `ativo`, race conditions can occur on the next message.
- The notification stub `all_operators` userId is a convention — Epic 18 will resolve it to actual operator user IDs. Document this in the stub's `NotificationPayload` type jsdoc.
- When returning `status: 'bot'`, do NOT automatically trigger agent processing of any queued messages — let the next inbound message naturally restart the loop.

### References

- [Source: docs/01-leedi-arquitetura.md#6.4 Domínio Messaging]
- [Source: docs/01-leedi-arquitetura.md#6.13 Domínio Notification]
- [Source: _bmad-output/planning-artifacts/epics.md#Story 14.3]
- [Source: _bmad-output/implementation-artifacts/14-1-real-time-conversation-list-filters.md] (inbox_assignments, status enum)
- [Source: _bmad-output/implementation-artifacts/14-2-conversation-detail-ai-handoff-summary.md] (conversation detail page)
- [Source: _bmad-output/implementation-artifacts/7-2-agent-core-processing-loop.md] (process-message.ts — add guard here)
- [Source: _bmad-output/implementation-artifacts/7-6-human-transfer-tool.md] (sets aguardando_humano, wire notification call here)
- [Source: _bmad-output/implementation-artifacts/4-5-outbound-message-sending-via-meta-cloud-api.md] (connection.enviarTexto — reuse for manual reply)

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
