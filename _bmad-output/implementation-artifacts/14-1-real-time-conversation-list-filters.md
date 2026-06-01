---
baseline_commit: 9ea8a05
---

# Story 14.1: Real-Time Conversation List & Filters

Status: ready-for-dev

## Story

As a tenant operator,
I want to see all active conversations in a real-time list with status indicators and filters,
so that I can quickly identify conversations that need my attention.

## Acceptance Criteria

1. **Given** the DB migration for `inbox_assignments` runs (table defined in Architecture §6.4), **When** applied, **Then** table exists with: `id` (uuid pk), `tenant_id` (uuid FK), `conversation_window_id` (uuid FK → `conversation_windows.id`), `assigned_to` (uuid nullable FK → `users.id`), `status` (enum `bot|aguardando_humano|em_atendimento|resolvido`), `resumo_handoff` (text nullable), `motivo_handoff` (text nullable), `created_at`, `updated_at`. RLS enabled with tenant isolation policy.
2. **Given** a tenant operator navigates to `apps/dashboard` → Conversas, **When** the page loads, **Then** a paginated list shows all `conversation_windows` for that tenant joined with their `inbox_assignments`, displaying: lead name, phone, last message preview (truncated at 60 chars), timestamp of last message, and a status badge mapping to: `bot` → "Bot" (gray), `aguardando_humano` → "Aguardando" (amber), `em_atendimento` → "Em atendimento" (blue), `resolvido` → "Resolvido" (green).
3. **Given** the operator applies filter `status = aguardando_humano`, **When** the filter is applied, **Then** only conversations with that `inbox_assignments.status` are shown and the filter state is reflected in the URL query string (`?status=aguardando_humano`) so it can be bookmarked/shared.
4. **Given** the operator applies filter by `temperatura` (frio|morno|quente), **When** applied, **Then** the list is filtered by the joined `leads.temperatura` value.
5. **Given** TanStack Query polls the `/api/inbox` endpoint every 8 seconds, **When** a lead's conversation status changes to `aguardando_humano` (e.g., via agent `transferir_humano` tool from Story 7.6), **Then** the conversation appears at the top of the list on the next poll cycle (≤ 8s latency) with the `aguardando_humano` badge.
6. **Given** the conversation status is `aguardando_humano` and the page has focus (document.visibilityState === 'visible') and the browser has granted notification permission, **When** the new status appears in the poll response, **Then** a browser notification sound plays using the Web Notifications API (one-time per conversation, deduplicated by `conversation_window_id`).
7. **Given** more than 20 conversations exist, **When** the page loads, **Then** the list is paginated (20 items/page) with a "Carregar mais" button or infinite scroll. The API response includes a `nextCursor` for cursor-based pagination.
8. **Given** no conversations exist for the tenant, **When** the page loads, **Then** an empty state is shown: "Nenhuma conversa ainda. Quando leads enviarem mensagens, elas aparecerão aqui."

## Tasks / Subtasks

- [ ] Task 1: DB schema + migration for `inbox_assignments` (AC: #1)
  - [ ] Create or update `packages/db/src/schema/messaging.ts` — add `inbox_assignments` table definition using Drizzle
  - [ ] `pgEnum('inbox_status', ['bot', 'aguardando_humano', 'em_atendimento', 'resolvido'])`
  - [ ] `inboxAssignments`: `id` (uuid pk), `tenantId` (uuid notNull FK → `tenants.id`), `conversationWindowId` (uuid notNull FK → `conversationWindows.id`), `assignedTo` (uuid nullable FK → `users.id`), `status` (inboxStatusEnum notNull default `'bot'`), `resumoHandoff` (text nullable), `motivoHandoff` (text nullable), `createdAt`, `updatedAt`
  - [ ] Check migration numbering in `packages/db/migrations/meta/_journal.json` — use next available (likely 0014)
  - [ ] `ENABLE ROW LEVEL SECURITY` + tenant isolation policy
  - [ ] Re-export from `packages/db/src/schema/index.ts`
- [ ] Task 2: API route — inbox list endpoint (AC: #2, #3, #4, #7)
  - [ ] Create `apps/api/src/routes/inbox.ts` with Hono router
  - [ ] `GET /api/inbox` — query params: `status?`, `temperatura?`, `cursor?`, `limit=20`
  - [ ] Join: `conversation_windows` + `inbox_assignments` + `leads` (name, phone, temperatura) + last `messages` (subquery for latest message per window)
  - [ ] Filter by `tenant_id` from session (RLS enforced), apply `status` and `temperatura` filters
  - [ ] Return: `{ items: ConversationListItem[], nextCursor: string | null }`
  - [ ] Register router in `apps/api/src/app.ts`
- [ ] Task 3: Inbox list page UI (AC: #2, #3, #4, #5, #6, #7, #8)
  - [ ] Create `apps/dashboard/app/(dashboard)/conversas/page.tsx`
  - [ ] TanStack Query: `useQuery({ queryKey: ['inbox', filters], queryFn: fetchInbox, refetchInterval: 8000 })`
  - [ ] `ConversationListItem` component: avatar/initials, lead name + phone, last message preview, timestamp (relative: "há 5 min"), status badge
  - [ ] Status badge component: colors as specified in AC #2
  - [ ] Filter bar: status select + temperatura select; sync with URL via `useSearchParams`
  - [ ] Deduplication ref (`Set<string>`) for browser notification sound (AC #6): play sound only once per new `aguardando_humano` window id per page session
  - [ ] Empty state component (AC #8)
  - [ ] Infinite scroll or "Carregar mais" with cursor (AC #7)
- [ ] Task 4: Ensure `inbox_assignments` row is created when `conversation_window` is created (AC: #2)
  - [ ] In `apps/api/src/use-cases/messaging/create-conversation-window.ts` (from Story 5.5), add: after inserting `conversation_windows`, insert `inbox_assignments` with `status: 'bot'` and `conversation_window_id = <new_window_id>`
  - [ ] Wrap in same DB transaction (Drizzle `db.transaction()`)
- [ ] Task 5: Tests (AC: #1, #2, #3, #5)
  - [ ] Unit: inbox list query returns correct joined data with filters applied
  - [ ] Unit: `status` filter correctly maps to `inbox_assignments.status`
  - [ ] Unit: cursor pagination returns correct `nextCursor`
  - [ ] Integration: `conversation_window` creation auto-creates `inbox_assignments` with `status: 'bot'`

## Dev Notes

- **Files to create:** `packages/db/src/schema/messaging.ts` (additions), `apps/api/src/routes/inbox.ts`, `apps/dashboard/app/(dashboard)/conversas/page.tsx`, `apps/dashboard/app/(dashboard)/conversas/components/conversation-list-item.tsx`, `apps/dashboard/app/(dashboard)/conversas/components/status-badge.tsx`
- **Files to modify:** `packages/db/src/schema/index.ts` (re-export), `apps/api/src/app.ts` (register route), `apps/api/src/use-cases/messaging/create-conversation-window.ts` (auto-create inbox assignment)
- **Polling decision:** TanStack Query `refetchInterval: 8000` (8s). This is V0 intentional — Supabase Realtime can replace it post-V0. Document as scaling debt.
- **Browser notification sound:** Use `new Audio('/sounds/notification.mp3').play()` + Web Notifications API `Notification.requestPermission()`. Sound file to be placed at `apps/dashboard/public/sounds/notification.mp3`. Do NOT use the Notifications API for the list update — only for the sound + badge on tab/taskbar.
- **Pagination:** Cursor-based using `conversation_windows.updated_at` + `id` as tie-breaker. `nextCursor = btoa(JSON.stringify({ updatedAt, id }))`.
- **Last message preview:** Use a subquery `SELECT content FROM messages WHERE conversation_window_id = ? ORDER BY created_at DESC LIMIT 1`. Truncate at 60 chars in UI.
- **No new npm packages** beyond existing stack.
- **Status badge** should re-use `packages/ui` badge/variant pattern from Story 1.5.

### Testing standards

- Vitest unit tests for query logic (mock Drizzle).
- Integration: API route with real DB (Supabase test instance) — test filter combinations.

### Pitfalls to avoid

- Do NOT query `agent_messages` or `agent_threads` from this route — those belong to `@leedi/agent-memory` exclusively.
- Do NOT create `inbox_assignments` outside of the `create-conversation-window` use case — all entry points must go through this.
- Polling `refetchOnWindowFocus: true` is default in TanStack Query — keep it, it improves perceived responsiveness when operator returns to tab.

### References

- [Source: docs/01-leedi-arquitetura.md#6.4 Domínio Messaging]
- [Source: _bmad-output/planning-artifacts/epics.md#Story 14.1]
- [Source: _bmad-output/implementation-artifacts/5-5-conversation-window-tracking-24h-billing-unit.md] (conversation_windows creation, must extend to create inbox_assignment)
- [Source: _bmad-output/implementation-artifacts/7-6-human-transfer-tool.md] (sets inbox_assignments.status = 'aguardando_humano', generates resumo_handoff)

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
