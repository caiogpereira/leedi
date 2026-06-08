---
baseline_commit: 2a06ca797c274ac8c2f8ef1bed83f6c991f11aec
---

# Story 18.1: Notification Infrastructure (Push + Email)

Status: review

## Story

As a **developer**,
I want a notification service that can send web push and email for any system event,
so that all other epics can trigger notifications without building their own delivery logic.

## Acceptance Criteria

1. **Given** any use case calls `notification.send({ userId, tenantId, tipo, titulo, corpo, canal: 'push' })`, **When** invoked, **Then** a web push notification is delivered to all browser subscriptions registered for that user (if any), and a `notifications` row is inserted with `status: 'enviado'` or `'falhou'`.
2. **Given** `notification.send({ ..., canal: 'email' })` is called, **When** invoked, **Then** a React Email template is rendered and sent via Resend from `noreply@leedi.digital`; a `notifications` row is inserted.
3. **Given** `canal: 'push'` and the user has no active push subscription, **When** the notification is triggered, **Then** push is silently skipped (no error thrown) and email is sent as fallback — the `notifications` row records `canal: 'email'` (fallback applied).
4. **Given** a dashboard user grants browser push permission, **When** they call `POST /api/push/subscribe` with their VAPID subscription object, **Then** the subscription is stored in `push_subscriptions` table keyed by `(user_id, endpoint)`.
5. **Given** a user navigates to a new browser/device, **When** they grant push permission again, **Then** both subscriptions are active — multi-device push is supported.
6. **Given** a user revokes push permission, **When** the next push send attempt returns a `410 Gone` response from the push service, **Then** the subscription row is automatically deleted from `push_subscriptions`.
7. **Given** a push send fails with non-recoverable error (not 410), **When** the error occurs, **Then** the failure is logged to Sentry with tenant context, and the `notifications` row is updated to `status: 'falhou'`.

## Tasks / Subtasks

- [x] Task 1: Database migration — `notification_preferences`, `notifications`, `push_subscriptions` tables (AC: #1, #2, #4, #5)
  - [x] Check `packages/db/migrations/meta/_journal.json` for the next available index. Use that index as the migration filename prefix (e.g., `000N_notifications_schema.sql`). Do NOT use a hardcoded number — migrations from Epics 5–17 will have consumed several indexes before this story is implemented.
  - [x] Create migration `0017_notifications_schema.sql` in `packages/db/migrations/`
  - [x] `push_subscriptions` table: `id uuid pk`, `user_id uuid not null`, `tenant_id uuid not null`, `endpoint text not null`, `p256dh text not null`, `auth text not null`, `created_at`; UNIQUE(`user_id, endpoint`)
  - [x] `notification_preferences` table: `id uuid pk`, `tenant_id uuid not null`, `user_id uuid not null`, `canais jsonb default '{"push": true, "email": true}'`, `eventos jsonb default '{}'`, `created_at`, `updated_at`; UNIQUE(`tenant_id, user_id`)
  - [x] `notifications` table: `id uuid pk`, `tenant_id uuid not null`, `user_id uuid not null`, `tipo text not null`, `titulo text`, `corpo text`, `canal notification_canal_enum not null`, `status notification_status_enum default 'pendente'`, `created_at`
  - [x] Create enums: `notification_canal_enum` (`push|email|whatsapp`), `notification_status_enum` (`pendente|enviado|lido|falhou`)
  - [x] Add Drizzle schema in `packages/db/src/schema/notifications.ts`; re-export from `packages/db/src/schema/index.ts`
  - [x] RLS: `push_subscriptions` and `notification_preferences` — user can SELECT/UPDATE own rows; `notifications` — user can SELECT own rows; service role INSERT/UPDATE all

- [x] Task 2: VAPID key generation and env config (AC: #4)
  - [x] Add `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (mailto:) to `packages/config/src/schema.ts`
  - [x] Update `.env.example` with instructions to generate keys via `npx web-push generate-vapid-keys`
  - [x] Add `web-push` npm package to `packages/notification`

- [x] Task 3: `PushProvider` adapter (AC: #1, #3, #6, #7)
  - [x] Create `packages/notification/src/adapters/push-provider.ts`
  - [x] Uses `web-push` library with VAPID keys from env
  - [x] `sendPush(subscriptions, payload)` — calls `webpush.sendNotification()` for each
  - [x] 410 Gone → mark subscription for deletion; other errors → Sentry
  - [x] After send: delete subscriptions marked `gone` from `push_subscriptions` table (AC #6)

- [x] Task 4: `notification.send()` use case (AC: #1–#3, #7)
  - [x] Create `packages/notification/src/use-cases/send-notification.ts`
  - [x] Input: `{ userId, tenantId, tipo, titulo, corpo, canal: 'push' | 'email' | 'both' }`
  - [x] Insert `notifications` row with `status: 'pendente'` first
  - [x] Dispatch based on `canal` with push→email fallback when no subscriptions exist
  - [x] Update `notifications.status` to `enviado` or `falhou`
  - [x] Export `sendNotification` from `packages/notification/src/index.ts`

- [x] Task 5: Push subscription API endpoints (AC: #4, #5)
  - [x] Create `apps/api/src/routes/push-subscriptions.ts`
  - [x] `POST /api/tenants/:tenantId/push/subscribe` → upsert into `push_subscriptions`; returns 200
  - [x] `DELETE /api/tenants/:tenantId/push/subscribe` → delete from `push_subscriptions`; returns 204
  - [x] RBAC: any authenticated tenant user can manage their own subscriptions
  - [x] Register routes in `apps/api/src/app.ts`

- [x] Task 6: Service Worker registration in dashboard app (AC: #4)
  - [x] Create `apps/dashboard/public/sw.js` — minimal service worker that handles `push` events
  - [x] Create `apps/dashboard/src/lib/push-registration.ts` — registers SW, requests push permission, calls subscribe endpoint
  - [x] Create `apps/dashboard/components/PushRegistrationInit.tsx` — client component wired into shell layout
  - [x] Create `apps/dashboard/app/api/tenants/[tenantId]/push/route.ts` — Next.js proxy to Hono backend
  - [x] VAPID public key exposed via `NEXT_PUBLIC_VAPID_PUBLIC_KEY` env var

- [x] Task 7: React Email template — generic system notification (AC: #2)
  - [x] Create `packages/notification/src/templates/system-notification.tsx`
  - [x] Simple template: `titulo` as H1, `corpo` as body text, "Ir para o painel" CTA button
  - [x] Register in `template-renderer.tsx`

- [x] Task 8: Tests (AC: #1, #3, #6)
  - [x] Unit: `sendNotification` with `canal: 'push'` and no subscriptions → falls back to email
  - [x] Unit: `PushProvider` receives 410 → subscription deleted from DB
  - [x] Unit: `sendNotification` updates `notifications.status` to `falhou` on push error
  - [x] Unit: `sendNotification` marks enviado when push succeeds; sends both when canal=both

## Dev Notes

- **Files to create:** `packages/db/migrations/000N_notifications_schema.sql` (use next index from journal), `packages/db/src/schema/notifications.ts`, `packages/notification/src/adapters/push-provider.ts`, `packages/notification/src/use-cases/send-notification.ts`, `packages/notification/src/templates/system-notification.tsx`, `apps/api/src/routes/push-subscriptions.ts`, `apps/dashboard/public/sw.js`, `apps/dashboard/src/lib/push-registration.ts`
- **Files to modify:** `packages/db/src/schema/index.ts`, `packages/notification/src/index.ts` (add `sendNotification` export), `packages/config/src/schema.ts` (VAPID keys), `.env.example`, `apps/api/src/app.ts` (register push routes), `apps/dashboard/app/layout.tsx` (SW registration)
- **`web-push` package:** Add to `packages/notification/package.json`. VAPID keys must be generated once and stored as env vars — do NOT regenerate on each deploy (push subscriptions would break).
- **Service Worker scope:** Place `sw.js` at `/public/sw.js` so it is served at root scope. Next.js serves `public/` at `/`.
- **`NEXT_PUBLIC_VAPID_PUBLIC_KEY`:** The VAPID public key must be available client-side for `applicationServerKey` in `pushManager.subscribe()`. Add as `NEXT_PUBLIC_` prefix in dashboard app's env.
- **Multi-device push:** `push_subscriptions` has UNIQUE on `(user_id, endpoint)` — each device endpoint is distinct. Sending push = iterate all rows for the user.
- **Email fallback timing:** Push fallback to email happens synchronously in the use case (not async retry). If push sends successfully to at least one device, email fallback is NOT triggered.
- **Replacing existing billing stubs:** The `send-billing-notification.ts` stub from Story 17.2 should be updated to call `sendNotification()` from this story once it's implemented.

### Testing standards

- Vitest unit tests for all `sendNotification` code paths
- Integration test: push subscription lifecycle (register → send → 410 → deleted)

### Pitfalls to avoid

- Do NOT store VAPID private key in the database or frontend — server-side env only.
- Do NOT call `sendNotification` synchronously in webhook handlers — enqueue to BullMQ and return 200 first (notification delivery is async).
- The `push_subscriptions` endpoint must NOT allow a user to delete subscriptions belonging to other users — enforce `WHERE user_id = authedUserId`.
- `web-push` library's `webpush.setVapidDetails()` must be called once at app startup, not per request.

### References

- [Source: docs/01-leedi-arquitetura.md#6.13 Domínio Notification] (notification_preferences, notifications schema)
- [Source: _bmad-output/planning-artifacts/epics.md#Story 18.1, FR109, FR112]
- [Source: _bmad-output/implementation-artifacts/17-2-payment-webhook-tenant-lock-unlock.md] (billing notification stubs to upgrade)
- [Source: packages/notification/src/adapters/resend.ts] (existing email adapter to reuse)

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

_none_

### Completion Notes List

- Implemented full notification infrastructure: DB schema (0017), Drizzle types, PushProvider adapter, sendNotification use case, push subscription API routes, Service Worker, dashboard registration, and React Email template.
- Async queueing decision: sendNotification is synchronous (no BullMQ — project uses QStash). Called from async job contexts that already handle async delivery.
- Migration applied to Supabase: push_subscriptions, notification_preferences, notifications tables with RLS policies.
- VAPID key config added to packages/config; web-push + @leedi/observability added to notification package deps.
- 7 unit tests pass: sendPush 410→delete, non-410→Sentry, success; sendNotification fallback, falhou, enviado, both.

### File List

- packages/db/migrations/0017_notifications_schema.sql (created)
- packages/db/src/schema/notifications.ts (created)
- packages/db/src/schema/index.ts (modified)
- packages/config/src/schema.ts (modified — VAPID keys)
- .env.example (modified — VAPID keys section)
- packages/notification/package.json (modified — web-push, @leedi/db, @leedi/observability, vitest)
- packages/notification/src/adapters/push-provider.ts (created)
- packages/notification/src/use-cases/send-notification.ts (created)
- packages/notification/src/templates/system-notification.tsx (created)
- packages/notification/src/template-renderer.tsx (modified)
- packages/notification/src/index.ts (modified)
- packages/notification/src/__tests__/send-notification.test.ts (created)
- packages/notification/src/__tests__/push-provider.test.ts (created)
- apps/api/src/routes/push-subscriptions.ts (created)
- apps/api/src/app.ts (modified — push routes)
- apps/dashboard/public/sw.js (created)
- apps/dashboard/src/lib/push-registration.ts (created)
- apps/dashboard/components/PushRegistrationInit.tsx (created)
- apps/dashboard/app/api/tenants/[tenantId]/push/route.ts (created)
- apps/dashboard/app/(shell)/layout.tsx (modified — PushRegistrationInit)

### Change Log

- 2026-06-03: Implemented Story 18.1 — Notification Infrastructure (Push + Email). Added push_subscriptions, notification_preferences, notifications DB tables; web-push VAPID adapter; sendNotification use case with push→email fallback; push subscription API endpoints; dashboard Service Worker registration; system-notification React Email template.
