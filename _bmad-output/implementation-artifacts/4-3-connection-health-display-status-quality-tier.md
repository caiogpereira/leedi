# Story 4.3: Connection Health Display (Status, Quality, Tier)

Status: ready-for-dev

## Story

As a tenant operator,
I want to see my WhatsApp connection health at a glance,
so that I know immediately if something is wrong with my channel.

## Acceptance Criteria

1. **Given** a tenant has a connected WhatsApp number, **When** they view the WhatsApp settings page, **Then** they see the connection status badge, the quality rating badge (Verde/Amarelo/Vermelho), and the messaging tier rendered human-readable in pt-BR (e.g. "1.000 mensagens/dia").
2. **Given** a connection error occurs (e.g. token expired), **When** the tenant views WhatsApp settings, **Then** the status shows "Erro" in the semantic error color (red, NOT WhatsApp green), **And** an actionable explanation is shown: "Seu token de acesso expirou. Gere um novo token no Meta Business Suite e atualize aqui."
3. **Given** the periodic health check runs, **When** Meta returns updated `quality_rating` / `messaging_limit_tier`, **Then** the `whatsapp_connections` row is updated with the new values and `last_health_check_at = now()`, **And** a token/permission failure sets `status: erro` without exposing the token.

## Tasks / Subtasks

- [ ] Task 1: `check-connection-health` use case (AC: #2, #3)
  - [ ] Create `packages/connection/src/use-cases/check-connection-health.ts` taking `{ tenantId }` (or iterating all active connections for the cron path)
  - [ ] Build a `MetaCloudProvider` from the stored (encrypted) connection; call Meta `GET /{phone_number_id}?fields=quality_rating,messaging_limit_tier,verified_name`
  - [ ] On success: update `quality_rating`, `messaging_tier`, `display_name`, `status: conectado`, `last_health_check_at = now()`
  - [ ] On auth/permission failure (e.g. 401/190 token expired): set `status: erro`, leave quality/tier as-is, record `last_health_check_at`; never log the token
  - [ ] Export from `packages/connection/src/index.ts`; all writes via `withTenant`
- [ ] Task 2: BullMQ scheduled health check (AC: #3)
  - [ ] Create queue `check-whatsapp-health` in `apps/api` (e.g. `apps/api/src/jobs/whatsapp-health.ts`) backed by Upstash Redis
  - [ ] Schedule a repeatable job every 15 minutes that enqueues a health check per active connection (or fans out)
  - [ ] Worker invokes `check-connection-health`; on failure log `tenant_id` + error code only (no token), report to Sentry
- [ ] Task 3: Health display UI (AC: #1, #2)
  - [ ] Extend `apps/dashboard/app/(shell)/settings/whatsapp/page.tsx` to render a health panel from the `GET` connection endpoint
  - [ ] Status badge mapping: `conectado` -> success/green, `erro` -> semantic error/red, `desconectado` -> neutral gray
  - [ ] Quality badge mapping: `verde` -> success color, `amarelo` -> warning color, `vermelho` -> error color
  - [ ] Tier mapping to pt-BR: `1k` -> "1.000 mensagens/dia", `10k` -> "10.000 mensagens/dia", `100k` -> "100.000 mensagens/dia", `unlimited` -> "Ilimitado"
  - [ ] Error state renders the actionable pt-BR message and a link/button to update the token (reuses Story 4.2 form)
  - [ ] WhatsApp green (`#25D366`) used ONLY on the connection/channel icon — never on the status badge
  - [ ] Show `last_health_check_at` as a relative timestamp in pt-BR ("verificado ha 3 min")
- [ ] Task 4: API endpoint for health (AC: #1, #2)
  - [ ] Ensure `GET /api/tenants/:tenantId/whatsapp` returns `status`, `quality_rating`, `messaging_tier`, `display_name`, `last_health_check_at` (token-free); add an on-demand `POST /api/tenants/:tenantId/whatsapp/health-check` to trigger a manual refresh (role: owner/operator)
- [ ] Task 5: Tests (AC: #1, #2, #3)
  - [ ] Unit: use case maps Meta success to updated fields + `status: conectado`; maps token-expired error to `status: erro` and logs no token
  - [ ] Unit: tier and badge color mappers produce the exact pt-BR strings / semantic tokens
  - [ ] Integration (BullMQ): repeatable job enqueues a health check; worker updates the row
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

### Completion Notes List

### File List
