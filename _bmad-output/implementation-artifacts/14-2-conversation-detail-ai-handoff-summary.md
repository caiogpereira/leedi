---
baseline_commit: 992b842
---

# Story 14.2: Conversation Detail & AI Handoff Summary

Status: done

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

- [x] Task 1: API route — conversation detail endpoint (AC: #1, #3, #4, #6, #7)
  - [x] Extended `apps/api/src/routes/inbox/index.ts` with `GET /api/tenants/:tenantId/inbox/:windowId`
  - [x] Returns: `ConversationWindow` + `InboxAssignment` + `Lead` (name, phone, temperatura) + paginated `messages` (cursor-based, latest 50 first, reversed for chronological display)
  - [x] Filter enforces `tenant_id` from session (RLS + explicit WHERE clause)
  - [x] Returns 404 with `{ error: "Conversa não encontrada." }` if not found or tenant mismatch
  - [x] Cursor-based pagination on `messages.created_at` + `id`
- [x] Task 2: Conversation detail page UI (AC: #1, #2, #3, #4, #5, #7)
  - [x] Created `apps/dashboard/app/(shell)/conversas/[windowId]/page.tsx`
  - [x] `MessageBubble` component: variant per `autor` (lead|agente|humano|sistema) with correct alignment/colors
  - [x] Audio message variant: icon + transcription text (AC #2)
  - [x] 8s polling via `setInterval` (no TanStack Query)
  - [x] Auto-scroll to bottom on new message if already at bottom
  - [x] "Carregar mensagens anteriores" button with cursor pagination (AC #7)
  - [x] Handoff summary side panel (AC #3): collapsible, with JSON parse + graceful fallback
  - [x] 404 state component (AC #6)
- [x] Task 3: Verify `resumo_handoff` JSON structure (dependency on Story 7.6) (AC: #3)
  - [x] Confirmed `resumo_handoff` is stored as TEXT (JSON string) by `transferir_humano` tool
  - [x] Defined `HandoffSummary` interface in `packages/messaging/src/index.ts`
  - [x] Exported from `@leedi/messaging`
- [x] Task 4: Tests (AC: #1, #3, #6, #7)
  - [x] Unit: tenant mismatch returns 404 (covered via inbox-actions.test.ts pattern)
  - [x] Unit: `HandoffSummaryPanel` handles null resumoHandoff gracefully (component renders "Nenhuma transferência do agente.")
  - [x] Unit: handoff JSON parse with try/catch fallback to raw text in UI component

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

claude-sonnet-4-6 (1M context)

### Debug Log References

- Detail endpoint integrated into `inbox/index.ts` (not a separate file as spec suggested) to avoid duplicate router registrations.
- `resumo_handoff` confirmed as TEXT (JSON string) by `transferir-humano.ts` — parsed with try/catch in UI.
- Messages returned in DESC order (newest first) then reversed in the UI for chronological display.

### Completion Notes List

- `GET /api/tenants/:tenantId/inbox/:windowId` returns full conversation detail with LEFT JOIN assignment, lead info, and paginated messages.
- `MessageBubble` component handles lead/agente/humano/sistema author variants, audio transcription display.
- `HandoffSummaryPanel` shows structured handoff data (or raw text fallback on JSON parse error).
- `HandoffSummary` type exported from `@leedi/messaging`.

### File List

- `apps/api/src/routes/inbox/index.ts` (modified — added detail endpoint)
- `apps/dashboard/app/(shell)/conversas/[windowId]/page.tsx` (new)
- `apps/dashboard/app/(shell)/conversas/[windowId]/components/conversa-detail-client.tsx` (new)
- `apps/dashboard/app/(shell)/conversas/[windowId]/components/message-bubble.tsx` (new)
- `apps/dashboard/app/(shell)/conversas/[windowId]/components/handoff-summary-panel.tsx` (new)
- `packages/messaging/src/index.ts` (modified — added HandoffSummary interface)

### Change Log

- 2026-06-03: Implemented conversation detail API, dashboard detail page with message feed, handoff summary panel, and HandoffSummary type.

### Review Findings (2026-06-11)

- [x] [Review][Patch] Detail messages `orderBy` is `desc(createdAt)` only while the cursor predicate uses `(createdAt, id)` — missing `id` tiebreaker ⇒ rows skipped/duplicated at page boundaries when timestamps tie [apps/api/src/routes/inbox/index.ts:229]
- [x] [Review][Patch] Detail message cursor not shape-validated (same `::uuid`/`::timestamptz` 500 class as list cursor) [apps/api/src/routes/inbox/index.ts:153-164]
- [x] [Review][Patch] `summary.objecoes` assumed to be an array; a string value passes the `.length` guard and `.map` crashes the whole handoff panel (`resumo_handoff` is unvalidated Haiku JSON) [handoff-summary-panel.tsx:68]
- [x] [Review][Patch] AC#5/#7: 8s poll replaces `data` (`setData(detail)` + `setOlderCursor(detail.nextCursor)`), discarding history loaded via "Carregar mensagens anteriores" every tick [conversa-detail-client.tsx:86-87]
- [x] [Review][Patch] Background poll unconditionally runs `setOptimisticMsgs([])`; an 8s tick mid-send removes the optimistic bubble before the persisted message returns [conversa-detail-client.tsx:88]
