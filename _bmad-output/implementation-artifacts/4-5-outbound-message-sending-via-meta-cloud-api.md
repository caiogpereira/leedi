# Story 4.5: Outbound Message Sending via Meta Cloud API

Status: ready-for-dev

## Story

As a developer,
I want the `@leedi/connection` package to send text, media, and template messages via the Meta Cloud API,
so that the agent and dispatcher can deliver messages to leads.

## Acceptance Criteria

1. **Given** the agent calls `connection.sendText(connection, to, body)`, **When** Meta returns `200 OK`, **Then** the returned message ID is saved to `messages` with `status: enviado`, `direction: outbound`, and `meta_message_id` set.
2. **Given** Meta returns a rate-limit error (`429`) during sending, **When** the send is retried with exponential backoff (max 3 attempts, delays 1s/2s/4s, honoring the `Retry-After` header when present), **Then** the message is either sent successfully (`status: enviado`) or, after exhausting retries, marked `status: falhou` with the error logged (no message body in production logs).
3. **Given** the agent produces multiple natural messages, **When** they are sent in sequence, **Then** each is a separate Meta API call with a 500ms delay between them, and each gets its own `messages` record.

## Tasks / Subtasks

- [ ] Task 1: Implement `sendText` on `MetaCloudProvider` (AC: #1, #2)
  - [ ] In `packages/connection/src/adapters/meta-cloud-provider.ts`, implement `sendText(to, body)` -> `POST /{phone_number_id}/messages` with `{ messaging_product: "whatsapp", to, type: "text", text: { body } }`
  - [ ] Parse the response; return `{ messageId }` from `messages[0].id`
- [ ] Task 2: Implement `sendTemplate` on `MetaCloudProvider` (AC: #1)
  - [ ] `sendTemplate(to, templateName, languageCode, components)` -> `POST /{phone_number_id}/messages` with `type: "template"` and the template/language/components payload
  - [ ] Keep the public port signature `sendTemplate(to, templateName, params: string[])`; map `params` to body `components` internally (language code defaulted/configurable)
- [ ] Task 3: Retry with exponential backoff (AC: #2)
  - [ ] Wrap Meta calls in a retry helper in `meta-cloud-provider.ts`: on `429` (and transient `5xx`), wait `Retry-After` seconds if present else backoff 1s/2s/4s; max 3 attempts
  - [ ] On non-retryable errors (4xx other than 429), fail fast — no retry
  - [ ] Surface a typed error including the Meta error code (never the token / message body)
- [ ] Task 4: `record-outbound-message` use case (AC: #1, #2, #3)
  - [ ] Create `packages/messaging/src/use-cases/record-outbound-message.ts` writing to `messages`: `{ tenant_id, conversation_id, direction: 'outbound', content, meta_message_id, status }`
  - [ ] On send success: `status: enviado` with the `meta_message_id`
  - [ ] On final failure after retries: `status: falhou` (record the error code/context, not the body)
  - [ ] All writes via `withTenant`; export from `packages/messaging/src/index.ts`
- [ ] Task 5: Natural message splitting / sequencing (AC: #3)
  - [ ] Provide a dispatcher that sends an array of messages sequentially with a 500ms delay between calls; each call records its own `messages` row
- [ ] Task 6: `messages` schema (preliminary for Epic 4) (AC: #1)
  - [ ] Ensure `packages/db/src/schema/message.ts` defines `messages(id, tenant_id, conversation_id, direction, content, meta_message_id, status, created_at)` with `status` enum `'enviado' | 'entregue' | 'lido' | 'falhou'` and `direction` enum `'inbound' | 'outbound'`; RLS on `tenant_id`
  - [ ] (Inbound reception in 4.4 also stores here; coordinate so the schema covers both `recebido`/inbound and outbound statuses — extend enum as agreed in the architecture)
- [ ] Task 7: Status webhook tracking hook (AC: #1)
  - [ ] Note: delivery/read status updates arrive via the Meta status webhook (handled in 4.4's webhook handler); map `delivered` -> `entregue`, `read` -> `lido` by `meta_message_id` (stub the update path here, full wiring in 4.4)
- [ ] Task 8: Tests (AC: #1, #2, #3)
  - [ ] Unit: `sendText` success returns `{ messageId }` and `record-outbound-message` writes `status: enviado`
  - [ ] Unit: 429 then 200 -> succeeds within retry budget; persistent 429 -> `status: falhou` after 3 attempts; assert backoff timing (mock timers) and `Retry-After` honored
  - [ ] Unit: non-429 4xx fails fast (no retry)
  - [ ] Unit: multi-message dispatch issues N calls with 500ms spacing and N records
  - [ ] Unit: assert logs never contain the token or the message body

## Dev Notes

- Files to modify: `packages/connection/src/adapters/meta-cloud-provider.ts` (implement send methods + retry).
- Files to create: `packages/messaging/src/use-cases/record-outbound-message.ts`, `packages/messaging/src/index.ts` (export), `packages/db/src/schema/message.ts` (if not created in 4.4), the sequential dispatcher helper.
- npm dependencies: Node `fetch` for Meta calls; no axios. Reuse `decryptToken` from `@leedi/connection` for the auth header (in-memory only).
- Adapter pattern: callers (agent/dispatcher) depend on the `WhatsAppProvider` port; Meta's request/response shape stays inside `MetaCloudProvider`.
- Coordinate the `messages` schema with Story 4.4 — both stories write to the same table; agree on the final `status` enum (inbound `recebido` + outbound `enviado|entregue|lido|falhou`) in one migration to avoid drift.

### Security considerations (NFR3 + LGPD)

- The decrypted token is used only to build the `Authorization: Bearer` header; never log, return, or persist it.
- NEVER log the message body in production (LGPD). Log only `request_id`, `tenant_id`, `meta_message_id`, status, and Meta error codes.
- Retry/error objects must be scrubbed of token and body before logging or Sentry capture.

### Testing standards

- Mock the Meta API in all unit tests (success, 429-with/without-Retry-After, 5xx, non-retryable 4xx). Use fake timers to assert backoff (1s/2s/4s) and the 500ms inter-message spacing without real waits.

### Pitfalls to avoid

- Do NOT retry non-429/non-5xx errors — fail fast and mark `falhou`.
- Honor `Retry-After` when Meta provides it; do not blindly fixed-wait.
- Do NOT log message bodies or tokens — only metadata + error codes.
- Keep the 500ms spacing between split messages so they arrive in order and avoid Meta throttling.
- Ensure `meta_message_id` is stored so the status webhook (4.4) can update `entregue`/`lido` later.

### Project Structure Notes

- Send logic + retry in `packages/connection` (adapter). Persistence in `packages/messaging` via `withTenant`. Shared `messages` schema in `packages/db`.

### References

- [Source: docs/01-leedi-arquitetura.md#6.2 Schema messages]
- [Source: _bmad-output/planning-artifacts/epics.md#Story 4.5: Outbound Message Sending via Meta Cloud API] (FR22)
- [Source: _bmad-output/planning-artifacts/epics.md#NFR3] (no secrets/bodies in logs)

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

### Completion Notes List

### File List
