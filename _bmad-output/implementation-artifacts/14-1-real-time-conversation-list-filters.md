---
baseline_commit: 992b842
---

# Story 14.1: Real-Time Conversation List & Filters

Status: review

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

- [x] Task 1: DB schema + migration for `inbox_assignments` (AC: #1)
  - [x] Create or update `packages/db/src/schema/messaging.ts` — add `inbox_assignments` table definition using Drizzle
  - [x] `pgEnum('inbox_status', ['bot', 'aguardando_humano', 'em_atendimento', 'resolvido'])`
  - [x] `inboxAssignments`: `id` (uuid pk), `tenantId` (uuid notNull FK → `tenants.id`), `conversationWindowId` (uuid notNull FK → `conversationWindows.id`), `assignedTo` (uuid nullable FK → `users.id`), `status` (inboxStatusEnum notNull default `'bot'`), `resumoHandoff` (text nullable), `motivoHandoff` (text nullable), `createdAt`, `updatedAt`
  - [x] Check migration numbering in `packages/db/migrations/meta/_journal.json` — use next available (likely 0014)
  - [x] `ENABLE ROW LEVEL SECURITY` + tenant isolation policy
  - [x] Re-export from `packages/db/src/schema/index.ts`
- [x] Task 2: API route — inbox list endpoint (AC: #2, #3, #4, #7)
  - [x] Create `apps/api/src/routes/inbox/index.ts` with Hono router
  - [x] `GET /api/tenants/:tenantId/inbox` — query params: `status?`, `temperatura?`, `cursor?`, `limit=20`
  - [x] Join: `conversation_windows` + `inbox_assignments` (LEFT JOIN) + `leads` (name, phone, temperatura) + last `messages` (correlated subquery for latest message per window)
  - [x] Filter by `tenant_id` from session (RLS enforced), apply `status` and `temperatura` filters
  - [x] Return: `{ items: ConversationListItem[], nextCursor: string | null }`
  - [x] Register router in `apps/api/src/app.ts`
- [x] Task 3: Inbox list page UI (AC: #2, #3, #4, #5, #6, #7, #8)
  - [x] Create `apps/dashboard/app/(shell)/conversas/page.tsx`
  - [x] 8s polling via `setInterval` (no TanStack Query installed; existing codebase uses plain fetch + useEffect)
  - [x] `ConversationListItem` component: avatar/initials, lead name + phone, last message preview, timestamp (relative: "há 5 min"), status badge
  - [x] Status badge component: colors as specified in AC #2
  - [x] Filter bar: status select + temperatura select; sync with URL via `useSearchParams` + `router.replace`
  - [x] Deduplication ref (`Set<string>`) for browser notification sound (AC #6): play sound only once per new `aguardando_humano` window id per page session
  - [x] Empty state component (AC #8)
  - [x] "Carregar mais" button with cursor pagination (AC #7)
- [x] Task 4: Ensure `inbox_assignments` row is created when `conversation_window` is created (AC: #2)
  - [x] In `packages/messaging/src/use-cases/resolve-conversation-window.ts`, add: after inserting `conversation_windows`, insert `inbox_assignments` with `status: 'bot'` inside the same `withTenant` transaction
  - [x] Only in the "new window" code paths (stale-close and no-window); NOT in the count-bump path
- [x] Task 5: Tests (AC: #1, #2, #3, #5)
  - [x] Unit: `conversation_window` creation auto-creates `inbox_assignments` with `status: 'bot'` (messaging package test)
  - [x] Unit: inbox_assignments insert captures correct tenantId and conversationWindowId
  - [x] Unit: existing fresh-window path does NOT create inbox_assignments (no regression)
  - [x] Unit: cursor pagination encodes/decodes correctly (tested via actions route tests)

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

claude-sonnet-4-6 (1M context)

### Debug Log References

- Task 1 was pre-implemented in migration 0006 (Story 5.5) — no new migration needed.
- TanStack Query is not installed; used plain `fetch` + `setInterval` pattern matching existing codebase.
- Task 4 path: `packages/messaging/src/use-cases/resolve-conversation-window.ts` (not `create-conversation-window.ts` as spec said).
- LEFT JOIN used in inbox list query so pre-existing windows without assignment rows still appear with COALESCE status='bot'.

### Completion Notes List

- `inbox_assignments` table and migration were already implemented in Story 5.5 (migration 0006).
- API route at `/api/tenants/:tenantId/inbox` with correlated subquery for last message per window.
- Dashboard page at `apps/dashboard/app/(shell)/conversas/page.tsx` with 8s polling, URL-synced filters, browser notification dedup, and cursor pagination.
- `resolveConversationWindow` extended to auto-insert `inbox_assignments` with `status: 'bot'` on new window creation.
- Unit tests verify auto-creation and non-regression on bump path.
- **UI not verified in browser** — no component render tests; dashboard typecheck passes (no TS errors in new files).
- **Inbox list query untested** — correlated subquery + COALESCE sort logic is not unit-tested; manual verification required.
- **app.ts transitive resend loading** — `actions.ts → @leedi/notification → resend.ts` eagerly creates `new Resend()` at module load time. Tests pass because health.test.ts (which imports app.ts) mocks @leedi/config with RESEND_API_KEY. Root cause: resend.ts module-scope initialization.

### File List

- `apps/api/src/routes/inbox/index.ts` (new)
- `apps/api/src/app.ts` (modified — registered inbox routers)
- `packages/messaging/src/use-cases/resolve-conversation-window.ts` (modified — auto-create inbox_assignment)
- `apps/dashboard/app/(shell)/conversas/page.tsx` (new)
- `apps/dashboard/app/(shell)/conversas/components/conversas-client.tsx` (new)
- `apps/dashboard/app/(shell)/conversas/components/conversation-list-item.tsx` (new)
- `apps/dashboard/app/(shell)/conversas/components/status-badge.tsx` (new)

### Change Log

- 2026-06-03: Implemented inbox list API route, dashboard page, and auto-creation of inbox_assignments on window creation.
