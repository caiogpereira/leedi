# Story 4.2: Connect WhatsApp Number (Tenant Configuration)

Status: ready-for-dev

## Story

As a tenant owner,
I want to enter my Meta credentials and validate the connection,
so that my WhatsApp Business number is linked to Leedi and ready to receive messages.

## Acceptance Criteria

1. **Given** a tenant owner navigates to Settings -> WhatsApp -> Conectar numero, **When** they enter `phone_number_id`, `waba_id`, `access_token` and click "Validar conexao", **Then** the system calls the Meta API to verify the credentials, **And** on success the connection is saved encrypted with `status: conectado`, **And** the UI shows a green badge with the verified phone number and display name.
2. **Given** the tenant enters invalid credentials, **When** "Validar conexao" is clicked, **Then** an error is shown: "Credenciais invalidas. Verifique o phone_number_id, waba_id e o token de acesso.", **And** no connection record is saved.
3. **Given** a connection already exists for the tenant (V1: one per tenant), **When** the owner opens the page, **Then** an update form is shown pre-filled with `phone_number_id`/`waba_id` (token masked, never returned), **And** re-validating with a new token replaces the stored encrypted credentials.

## Tasks / Subtasks

- [ ] Task 1: `connect-whatsapp-number` use case (AC: #1, #2, #3)
  - [ ] Create `packages/connection/src/use-cases/connect-whatsapp-number.ts` taking `{ tenantId, phoneNumberId, wabaId, accessToken }`
  - [ ] Instantiate a `MetaCloudProvider` with the supplied (not-yet-stored) credentials and call `validateConnection()` FIRST
  - [ ] On validation failure: throw a typed `InvalidCredentialsError` — do NOT write anything to the DB
  - [ ] On success: `encryptToken(accessToken)`, upsert into `whatsapp_connections` (insert or update existing for the tenant) with `status: conectado`, `display_name`, `quality_rating`, `messaging_tier`, `last_health_check_at = now()`
  - [ ] All writes go through the use case and `withTenant(tenantId, ...)`; export from `packages/connection/src/index.ts`
- [ ] Task 2: Hono route (AC: #1, #2, #3)
  - [ ] Create `apps/api/src/routes/whatsapp.ts` with `POST /api/tenants/:tenantId/whatsapp/connect`
  - [ ] Auth middleware: require an authenticated session with `role = owner` for the target tenant; reject others with 403
  - [ ] Validate body with Zod (`phone_number_id`, `waba_id`, `access_token` all required, non-empty strings)
  - [ ] Call the use case; map `InvalidCredentialsError` -> `400` with the exact pt-BR message; success -> `200` with `{ status, displayName, qualityRating, messagingTier, phoneNumberId }` (NEVER the token)
  - [ ] Add `GET /api/tenants/:tenantId/whatsapp` returning current connection (token-free) for the page to render the update form
- [ ] Task 3: Dashboard page + form (AC: #1, #2, #3)
  - [ ] Create `apps/dashboard/app/(shell)/settings/whatsapp/page.tsx`
  - [ ] Server-load the existing connection (token-free); if present render the update form, else the connect form
  - [ ] Form fields (shadcn/ui): `phone_number_id`, `waba_id`, `access_token` (type=password) + "Validar conexao" submit button
  - [ ] On success: show a green "Conectado" badge with the verified phone number + `display_name`
  - [ ] On failure: show the exact pt-BR error message inline; keep entered values (except clear the token field)
  - [ ] Loading/disabled state on the button while validating
- [ ] Task 4: Tests (AC: #1, #2, #3)
  - [ ] Unit: use case calls `validateConnection()` before any DB write; on failure asserts NO row written
  - [ ] Unit: on success the stored token is encrypted (not equal to plaintext) and the response object contains no token field
  - [ ] Integration (Hono): non-owner role -> 403; invalid creds -> 400 with exact message; valid creds -> 200 + token-free body
  - [ ] E2E (MCP Playwright): fill form with valid (mocked) creds -> green "Conectado" badge appears; invalid creds -> error message visible

## Dev Notes

- Files to create: `packages/connection/src/use-cases/connect-whatsapp-number.ts`, `apps/api/src/routes/whatsapp.ts`, `apps/dashboard/app/(shell)/settings/whatsapp/page.tsx` (+ a client form component if extracted).
- Files to modify: `packages/connection/src/index.ts` (export the use case + `InvalidCredentialsError`), `apps/api/src/index.ts` (mount the route).
- npm dependencies: Zod (validation), shadcn/ui form primitives (already in `packages/ui` from Epic 1). No new external SDK.
- Adapter pattern: the use case depends on the `WhatsAppProvider` port; inject a `MetaCloudProvider` factory so tests can supply a fake provider.
- Validate-before-persist is the core invariant: a failed Meta validation must leave the DB untouched.

### Security considerations (NFR3)

- The `access_token` is encrypted via `encryptToken` (Story 4.1) before persistence and is NEVER returned by `GET` or echoed in any response/error.
- The update form pre-fills `phone_number_id`/`waba_id` only; the token field is always empty and masked.
- Do not include the token in validation error messages or Sentry context.
- Authorization: only the tenant `owner` may connect/update; verify the `:tenantId` matches the caller's membership.

### Testing standards

- Mock the Meta API in unit/integration tests. E2E uses MCP Playwright against the running dashboard with the API's Meta calls stubbed. Assert the green badge and the exact pt-BR error string.

### Pitfalls to avoid

- Do NOT persist credentials before `validateConnection()` succeeds.
- Do NOT return or log the token anywhere — responses are token-free.
- Use the semantic success/green badge per design tokens; WhatsApp green (`#25D366`) belongs only on the channel icon / connect button, not the status badge.
- Enforce one connection per tenant (V1) — upsert, do not create duplicates.

### Project Structure Notes

- Use case in `packages/connection`; HTTP route in `apps/api`; UI in `apps/dashboard` under the `(shell)` settings group.

### References

- [Source: docs/01-leedi-arquitetura.md#6.2 Schema whatsapp_connections]
- [Source: _bmad-output/planning-artifacts/epics.md#Story 4.2: Connect WhatsApp Number (Tenant Configuration)] (FR17, FR23)
- [Source: _bmad-output/planning-artifacts/epics.md#UX-DR1] (WhatsApp green only on channel icon / connect button)

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

### Completion Notes List

### File List
