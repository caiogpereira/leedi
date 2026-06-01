---
baseline_commit: 9ea8a05
---

# Story 18.1: Notification Infrastructure (Push + Email)

Status: ready-for-dev

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

- [ ] Task 1: Database migration — `notification_preferences`, `notifications`, `push_subscriptions` tables (AC: #1, #2, #4, #5)
  - [ ] Check `packages/db/migrations/meta/_journal.json` for the next available index. Use that index as the migration filename prefix (e.g., `000N_notifications_schema.sql`). Do NOT use a hardcoded number — migrations from Epics 5–17 will have consumed several indexes before this story is implemented.
  - [ ] Create migration `000N_notifications_schema.sql` in `packages/db/migrations/` (replace N with the actual next index)
  - [ ] `push_subscriptions` table: `id uuid pk`, `user_id uuid not null`, `tenant_id uuid not null`, `endpoint text not null`, `p256dh text not null`, `auth text not null`, `created_at`; UNIQUE(`user_id, endpoint`)
  - [ ] `notification_preferences` table: `id uuid pk`, `tenant_id uuid not null`, `user_id uuid not null`, `canais jsonb default '{"push": true, "email": true}'`, `eventos jsonb default '{}'`, `created_at`, `updated_at`; UNIQUE(`tenant_id, user_id`)
  - [ ] `notifications` table: `id uuid pk`, `tenant_id uuid not null`, `user_id uuid not null`, `tipo text not null`, `titulo text`, `corpo text`, `canal notification_canal_enum not null`, `status notification_status_enum default 'pendente'`, `created_at`
  - [ ] Create enums: `notification_canal_enum` (`push|email|whatsapp`), `notification_status_enum` (`pendente|enviado|lido|falhou`)
  - [ ] Add Drizzle schema in `packages/db/src/schema/notifications.ts`; re-export from `packages/db/src/schema/index.ts`
  - [ ] RLS: `push_subscriptions` and `notification_preferences` — user can SELECT/UPDATE own rows; `notifications` — user can SELECT own rows; service role INSERT/UPDATE all

- [ ] Task 2: VAPID key generation and env config (AC: #4)
  - [ ] Add `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (mailto:) to `packages/config/src/schema.ts`
  - [ ] Update `.env.example` with instructions to generate keys via `npx web-push generate-vapid-keys`
  - [ ] Add `web-push` npm package to `packages/notification`

- [ ] Task 3: `PushProvider` adapter (AC: #1, #3, #6, #7)
  - [ ] Create `packages/notification/src/adapters/push-provider.ts`
  - [ ] Uses `web-push` library with VAPID keys from env
  - [ ] `sendPush(subscriptions: PushSubscription[], payload: { title, body }): Promise<PushResult[]>`
    - Calls `webpush.sendNotification()` for each subscription
    - If `statusCode === 410` (Gone): mark subscription for deletion (return `{ gone: true, endpoint }`)
    - Other errors: log to Sentry; return `{ failed: true, endpoint }`
  - [ ] After send: delete subscriptions marked `gone` from `push_subscriptions` table (AC #6)

- [ ] Task 4: `notification.send()` use case (AC: #1–#3, #7)
  - [ ] Create `packages/notification/src/use-cases/send-notification.ts`
  - [ ] Input: `{ userId, tenantId, tipo, titulo, corpo, canal: 'push' | 'email' | 'both' }`
  - [ ] Insert `notifications` row with `status: 'pendente'` first
  - [ ] Dispatch based on `canal`:
    - `push`: load `push_subscriptions WHERE user_id = userId`; if none → fallback to email (update `canal` to `email` in notifications row); else call `PushProvider.sendPush()`
    - `email`: call existing `sendEmailViaResend()` with appropriate template
    - `both`: send push (with fallback logic) AND email
  - [ ] Update `notifications.status` to `enviado` or `falhou`
  - [ ] Export `sendNotification` from `packages/notification/src/index.ts`

- [ ] Task 5: Push subscription API endpoints (AC: #4, #5)
  - [ ] Create `apps/api/src/routes/push-subscriptions.ts`
  - [ ] `POST /api/push/subscribe`: body `{ endpoint, keys: { p256dh, auth } }` → upsert into `push_subscriptions`; returns 200
  - [ ] `DELETE /api/push/subscribe`: body `{ endpoint }` → delete from `push_subscriptions`; returns 204
  - [ ] RBAC: any authenticated tenant user can manage their own subscriptions

- [ ] Task 6: Service Worker registration in dashboard app (AC: #4)
  - [ ] Create `apps/dashboard/public/sw.js` — minimal service worker that handles `push` events and shows `self.registration.showNotification(event.data.json().title, { body, icon })`
  - [ ] Create `apps/dashboard/src/lib/push-registration.ts` — registers SW, requests push permission, calls `POST /api/push/subscribe` with subscription object
  - [ ] Wire `push-registration.ts` into dashboard root layout (`apps/dashboard/app/layout.tsx`) as a `useEffect` (client-side only)
  - [ ] Expose VAPID public key to frontend via `GET /api/push/vapid-public-key` or via Next.js env `NEXT_PUBLIC_VAPID_PUBLIC_KEY`

- [ ] Task 7: React Email template — generic system notification (AC: #2)
  - [ ] Create `packages/notification/src/templates/system-notification.tsx`
  - [ ] Simple template: `titulo` as H1, `corpo` as body text, Leedi logo header, "Ir para o painel" CTA button
  - [ ] Register in `template-renderer.tsx`

- [ ] Task 8: Tests (AC: #1, #3, #6)
  - [ ] Unit: `sendNotification` with `canal: 'push'` and no subscriptions → falls back to email
  - [ ] Unit: `PushProvider` receives 410 → subscription deleted from DB
  - [ ] Unit: `POST /api/push/subscribe` inserts subscription; second call with same endpoint upserts
  - [ ] Unit: `sendNotification` updates `notifications.status` to `falhou` on push error

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

_not yet assigned_

### Debug Log References

_none_

### Completion Notes List

_not yet implemented_

### File List

_not yet implemented_

### Change Log

_none_
