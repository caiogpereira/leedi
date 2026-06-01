---
baseline_commit: 9ea8a05
---

# Story 14.2: Conversation Detail & AI Handoff Summary

Status: ready-for-dev

## Story

As a tenant operator,
I want to open a conversation and see its full history plus an AI-generated handoff summary,
so that I can understand the full context before responding.

## Acceptance Criteria

1. **Given** an operator clicks on a conversation in the inbox list (Story 14.1), **When** the detail view opens, **Then** the complete message history from `messages` table is shown in chronological order with: timestamp, sender label ("Lead", "Agente", "Humano", "Sistema"), and message content. Messages from `autor: agente` are styled differently from `autor: humano` and `autor: lead`.
2. **Given** the conversation has transcribed audio messages (`messages.tipo = 'audio'` and `messages.transcricao != null`), **When** rendered, **Then** a voice message indicator is shown with the transcription text displayed underneath: "[Áudio] texto transcrito aqui".
3. **Given** the conversation has an `inbox_assignments` record with `resumo_handoff != null` (populated by Story 7.6 `transferir_humano` tool), **When** the detail view opens, **Then** a collapsible side panel shows the AI handoff summary with labeled sections: "Quem é o lead", "O que quer", "Objeções levantadas", "Temperatura", "Motivo da transferência", "Resposta sugerida".
4. **Given** `inbox_assignments.resumo_handoff` is null (agent never transferred — operator opened conversation proactively), **When** the detail view opens, **Then** the side panel is absent or shows: "Nenhuma transferência do agente. Aberto diretamente."
5. **Given** the conversation detail page is open and TanStack Query polls every 8 seconds, **When** a new message arrives (agent or lead), **Then** it appears in the message list on the next poll without a page reload. New messages scroll into view automatically if the operator was already at the bottom of the list.
6. **Given** an operator navigates to a conversation that belongs to a different tenant, **When** the API is queried, **Then** it returns 404 (RLS + explicit tenant filter) and the UI shows: "Conversa não encontrada."
7. **Given** the conversation has more than 100 messages, **When** the detail page opens, **Then** the most recent 50 messages are loaded first, with a "Carregar mensagens anteriores" button that loads the previous 50 in reverse-chronological batches.

## Tasks / Subtasks

- [ ] Task 1: API route — conversation detail endpoint (AC: #1, #3, #4, #6, #7)
  - [ ] Create `apps/api/src/routes/inbox-detail.ts` (or extend `apps/api/src/routes/inbox.ts`)
  - [ ] `GET /api/inbox/:conversationWindowId` — returns: `ConversationWindow` + `InboxAssignment` + `Lead` (name, phone, temperatura) + paginated `messages` (cursor-based, latest 50 first)
  - [ ] Filter enforces `tenant_id` from session (RLS + explicit WHERE clause)
  - [ ] Return 404 with `{ error: "Conversa não encontrada" }` if not found or tenant mismatch
  - [ ] `GET /api/inbox/:conversationWindowId/messages?cursor=` — paginated older messages
- [ ] Task 2: Conversation detail page UI (AC: #1, #2, #3, #4, #5, #7)
  - [ ] Create `apps/dashboard/app/(dashboard)/conversas/[windowId]/page.tsx`
  - [ ] Message feed component: `MessageBubble` — variant per `autor` (lead|agente|humano|sistema)
  - [ ] Audio message variant: icon + transcription text (AC #2)
  - [ ] TanStack Query: `refetchInterval: 8000` for message list (same pattern as 14.1)
  - [ ] Auto-scroll to bottom on new message if already at bottom (use `useRef` + `scrollIntoView`)
  - [ ] "Carregar mensagens anteriores" button with cursor pagination (AC #7)
  - [ ] Handoff summary side panel (AC #3): collapsible, extracted from `inbox_assignments.resumo_handoff`
  - [ ] Parse `resumo_handoff` — store as structured JSON in Story 7.6 (sections: `quem_e`, `o_que_quer`, `objecoes`, `temperatura`, `motivo`, `resposta_sugerida`). Display each field with label.
  - [ ] 404 state component (AC #6)
- [ ] Task 3: Verify `resumo_handoff` JSON structure (dependency on Story 7.6) (AC: #3)
  - [ ] Confirm `inbox_assignments.resumo_handoff` is stored as structured JSON by `transferir_humano` tool
  - [ ] Define TypeScript type `HandoffSummary = { quem_e: string; o_que_quer: string; objecoes: string[]; temperatura: 'frio'|'morno'|'quente'; motivo: string; resposta_sugerida: string }` in `packages/messaging/src/index.ts`
  - [ ] Export from `@leedi/messaging`
- [ ] Task 4: Tests (AC: #1, #3, #6, #7)
  - [ ] Unit: conversation detail query returns messages in chronological order
  - [ ] Unit: tenant mismatch returns 404
  - [ ] Unit: cursor pagination returns correct batches
  - [ ] Unit: handoff summary returns null gracefully when not set
  - [ ] Integration: full detail page renders with mocked API response

## Dev Notes

- **Files to create:** `apps/api/src/routes/inbox-detail.ts`, `apps/dashboard/app/(dashboard)/conversas/[windowId]/page.tsx`, `apps/dashboard/app/(dashboard)/conversas/[windowId]/components/message-bubble.tsx`, `apps/dashboard/app/(dashboard)/conversas/[windowId]/components/handoff-summary-panel.tsx`
- **Files to modify:** `apps/api/src/app.ts` (register route), `packages/messaging/src/index.ts` (export `HandoffSummary` type)
- **Message author styling:** Lead → left-aligned bubble (neutral-100 bg); Agent → right-aligned (indigo-100 bg); Human → right-aligned (green-100 bg); System → centered small gray text.
- **Resumo handoff structure:** Story 7.6 generates this. Treat `resumo_handoff` as `TEXT` (JSON string). Parse with `JSON.parse` in UI; catch parse errors gracefully (show raw text if not valid JSON — forward-compatible).
- **No new npm packages** beyond existing stack.
- **Polling pattern** identical to 14.1 — 8s interval, `refetchOnWindowFocus: true`.

### Testing standards

- Vitest unit tests for query + cursor logic.
- Render test for `MessageBubble` variants (lead/agente/humano/audio).

### Pitfalls to avoid

- Do NOT fetch `agent_messages` / `agent_threads` here — the message history comes from `messages` table (Messaging domain), not Agent Memory domain.
- Do NOT assume `resumo_handoff` is always valid JSON — always wrap `JSON.parse` in try/catch.
- Pagination cursor must be based on `messages.created_at` + `id`, not offset, to avoid missing messages on new arrivals during pagination.

### References

- [Source: docs/01-leedi-arquitetura.md#6.4 Domínio Messaging]
- [Source: _bmad-output/planning-artifacts/epics.md#Story 14.2]
- [Source: _bmad-output/implementation-artifacts/14-1-real-time-conversation-list-filters.md] (inbox list, polling pattern)
- [Source: _bmad-output/implementation-artifacts/7-6-human-transfer-tool.md] (generates resumo_handoff + motivo_handoff into inbox_assignments)

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
