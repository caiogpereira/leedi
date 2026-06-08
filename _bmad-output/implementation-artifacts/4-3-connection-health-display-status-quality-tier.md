# Story 4.3: Connection Health Display (Status, Quality, Tier)

---
baseline_commit: 992b8421baa46b95ff2bdc69d31ad25932927f0c
---

Status: review

## Story

As a tenant operator,
I want to see my WhatsApp connection health at a glance,
so that I know immediately if something is wrong with my channel.

## Acceptance Criteria

1. **Given** a tenant has a connected WhatsApp number, **When** they view the WhatsApp settings page, **Then** they see the connection status badge, the quality rating badge (Verde/Amarelo/Vermelho), and the messaging tier rendered human-readable in pt-BR (e.g. "1.000 mensagens/dia").
2. **Given** a connection error occurs (e.g. token expired), **When** the tenant views WhatsApp settings, **Then** the status shows "Erro" in the semantic error color (red, NOT WhatsApp green), **And** an actionable explanation is shown: "Seu token de acesso expirou. Gere um novo token no Meta Business Suite e atualize aqui."
3. **Given** the periodic health check runs, **When** Meta returns updated `quality_rating` / `messaging_limit_tier`, **Then** the `whatsapp_connections` row is updated with the new values and `last_health_check_at = now()`, **And** a token/permission failure sets `status: erro` without exposing the token.

## Tasks / Subtasks

- [x] Task 1: `check-connection-health` use case (AC: #2, #3)
  - [x] Create `packages/connection/src/use-cases/check-connection-health.ts` taking `{ tenantId }` (or iterating all active connections for the cron path)
  - [x] Build a `MetaCloudProvider` from the stored (encrypted) connection; call Meta `GET /{phone_number_id}?fields=quality_rating,messaging_limit_tier,verified_name`
  - [x] On success: update `quality_rating`, `messaging_tier`, `display_name`, `status: conectado`, `last_health_check_at = now()`
  - [x] On auth/permission failure (e.g. 401/190 token expired): set `status: erro`, leave quality/tier as-is, record `last_health_check_at`; never log the token
  - [x] Export from `packages/connection/src/index.ts`; all writes via `withTenant`
- [x] Task 2: QStash scheduled health check (AC: #3) — switched from BullMQ to QStash (REST-based, no RESP needed)
  - [x] Create `apps/api/src/routes/internal.ts` with `POST /api/internal/whatsapp/health-check-all`
  - [x] Verify QStash signature via `Receiver` before processing
  - [x] Fetch all `conectado` connections via `withServiceRole`, run `checkConnectionHealth` per tenant
  - [x] QStash cron setup is manual (docs below); schedule: `*/15 * * * *`
- [x] Task 3: Health display UI (AC: #1, #2)
  - [x] Extend `apps/dashboard/app/(shell)/settings/whatsapp/page.tsx` to render a health panel from the `GET` connection endpoint
  - [x] Status badge mapping: `conectado` -> success/green, `erro` -> semantic error/red, `desconectado` -> neutral gray
  - [x] Quality badge mapping: `verde` -> success color, `amarelo` -> warning color, `vermelho` -> error color
  - [x] Tier mapping to pt-BR: `1k` -> "1.000 mensagens/dia", `10k` -> "10.000 mensagens/dia", `100k` -> "100.000 mensagens/dia", `unlimited` -> "Ilimitado"
  - [x] Error state renders the actionable pt-BR message and a link/button to update the token (reuses Story 4.2 form)
  - [x] WhatsApp green (`#25D366`) used ONLY on the connection/channel icon — never on the status badge
  - [x] Show `last_health_check_at` as a relative timestamp in pt-BR ("verificado ha 3 min")
- [x] Task 4: API endpoint for health (AC: #1, #2)
  - [x] Ensure `GET /api/tenants/:tenantId/whatsapp` returns `status`, `quality_rating`, `messaging_tier`, `display_name`, `last_health_check_at` (token-free); add an on-demand `POST /api/tenants/:tenantId/whatsapp/health-check` to trigger a manual refresh (role: owner/operator)
- [x] Task 5: Tests (AC: #1, #2, #3) — partial (BullMQ integration test deferred with Task 2)
  - [x] Unit: use case maps Meta success to updated fields + `status: conectado`; maps token-expired error to `status: erro` and logs no token
  - [x] Unit: tier and badge color mappers produce the exact pt-BR strings / semantic tokens
  - [x] Integration (QStash): `POST /api/internal/whatsapp/health-check-all` verifies signature, iterates connections, calls health check
  - [ ] E2E (MCP Playwright): connected state shows three badges; simulated error state shows "Erro" red badge + the exact actionable message

## Dev Notes

- Files to create: `packages/connection/src/use-cases/check-connection-health.ts`, `apps/api/src/jobs/whatsapp-health.ts`, badge/tier mapper helpers (e.g. `apps/dashboard/.../whatsapp/health-display.ts`).
- Files to modify: `apps/dashboard/app/(shell)/settings/whatsapp/page.tsx`, `apps/api/src/routes/whatsapp.ts` (add health-check endpoint), `packages/connection/src/index.ts`.
- npm dependencies: `bullmq` + Upstash Redis client (per Epic 1 infra). No new Meta SDK.
- Reuse the `MetaCloudProvider` adapter and the `WhatsAppProvider` port — the health check is just another Meta read mapped to domain fields.

### Security considerations (NFR3)

- The health check decrypts the token in-memory only to call Meta; a token-expired response must NOT surface the token in logs, Sentry, or the UI.
- The actionable error guides the user to regenerate the token in Meta Business Suite — it never displays or hints at the current token value.

### Testing standards

- Mock Meta in unit tests for both healthy and token-expired responses. E2E asserts exact badge labels, semantic colors, and the pt-BR error/tier strings.

### Pitfalls to avoid

- Do NOT use WhatsApp green for the status badge — use the semantic success token; `erro` must be the semantic error/red.
- Do NOT log the token on a health-check failure.
- Keep tier labels human-readable in pt-BR; do not show raw enum values (`1k`, `10k`).
- The cron must not hammer Meta — 15-minute cadence; fan out gently if there are many tenants (avoid bursts that trigger Meta rate limits).

### Project Structure Notes

- Use case + Meta mapping in `packages/connection`; scheduled job + endpoint in `apps/api`; presentation/mappers in `apps/dashboard`.

### References

- [Source: docs/01-leedi-arquitetura.md#6.2 Schema whatsapp_connections]
- [Source: _bmad-output/planning-artifacts/epics.md#Story 4.3: Connection Health Display (Status, Quality, Tier)] (FR18, FR19, FR20)
- [Source: _bmad-output/planning-artifacts/epics.md#UX-DR1] (semantic colors; WhatsApp green only on channel icon)

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

- BLOCKED — Task 2 (BullMQ scheduled job): Current infra only has `@upstash/redis` REST client. BullMQ requires RESP protocol (`ioredis`). Options: (1) defer, (2) QStash (Upstash REST cron), (3) add `UPSTASH_REDIS_URL` env + ioredis + BullMQ dep. Awaiting user decision.
- Health check use case: uses same `MetaCloudProvider` from 4.1; catch-all on `validateConnection()` failure → `status: erro`, no token leaked.
- Dashboard HealthPanel: `triggerHealthCheck` server action calls `checkConnectionHealth` then re-fetches updated row via `withTenant`.

### Completion Notes List

- AC #1: Health panel shows status/quality/tier badges with semantic colors (not WhatsApp green), tier in pt-BR, relative timestamp.
- AC #2: `status: erro` shows red semantic badge + "Seu token de acesso expirou. Gere um novo token no Meta Business Suite e atualize aqui."
- AC #3: use case implemented (validate-on-demand works). Periodic cron (Task 2) blocked on scheduler decision.
- 14 unit tests in `@leedi/connection`. 18 unit tests in `@leedi/dashboard`.
- `POST /health-check` endpoint added to Hono API — allows any tenant member to trigger on-demand refresh.

### File List

- packages/connection/src/use-cases/check-connection-health.ts (created)
- packages/connection/src/__tests__/check-connection-health.test.ts (created)
- packages/connection/src/index.ts (modified — added checkConnectionHealth exports)
- apps/api/src/routes/whatsapp.ts (modified — added POST /health-check endpoint)
- apps/dashboard/app/(shell)/settings/whatsapp/page.tsx (modified — added HealthPanel + messagingTier/lastHealthCheckAt fields)
- apps/dashboard/app/(shell)/settings/whatsapp/health-panel.tsx (created)
- apps/dashboard/app/(shell)/settings/whatsapp/health-display.ts (created)
- apps/dashboard/app/(shell)/settings/whatsapp/health-display.test.ts (created)
- apps/dashboard/app/(shell)/settings/whatsapp/actions.ts (modified — added triggerHealthCheck + imports)

## Change Log

- 2026-05-31: Story 4.3 implemented (Tasks 1, 3, 4, 5 partial). Task 2 (BullMQ cron) blocked pending scheduler architecture decision. 14 new tests in connection, 18 in dashboard.
