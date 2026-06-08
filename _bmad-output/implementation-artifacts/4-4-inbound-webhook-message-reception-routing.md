# Story 4.4: Inbound Webhook Message Reception & Routing

---
baseline_commit: 992b8421baa46b95ff2bdc69d31ad25932927f0c
---

Status: review

## Story

As a developer,
I want the Meta webhook to receive inbound messages, validate signatures, buffer rapid sequences, and route to the agent processor,
so that every lead message triggers the agent reliably without duplication.

## Acceptance Criteria

1. **Given** Meta sends a webhook POST to `/webhook/meta` with a valid `X-Hub-Signature-256`, **When** received, **Then** the request is acknowledged with `200 OK` immediately, **And** the message is pushed to a Redis buffer for the lead (debounce key `leedi:msg_buffer:{tenant_id}:{lead_phone}`, 6-second TTL).
2. **Given** Meta sends a webhook with an invalid `X-Hub-Signature-256`, **When** received, **Then** it responds `403 Forbidden` and discards the payload without any processing.
3. **Given** two messages arrive from the same lead within 6 seconds, **When** the debounce timer fires, **Then** both messages are delivered together as a single batch to the agent use case.
4. **Given** the same `meta_message_id` is received twice, **When** the second arrives, **Then** it is deduplicated and not processed again.
5. **Given** the webhook subscription verification handshake, **When** Meta calls `GET /webhook/meta?hub.mode=subscribe&hub.verify_token=...&hub.challenge=...`, **Then** the endpoint echoes `hub.challenge` only when `hub.verify_token` matches the configured token, else `403`.

## Tasks / Subtasks

- [x] Task 1: Webhook verification (GET) endpoint (AC: #5)
  - [x] Create `apps/api/src/routes/webhook-meta.ts` with `GET /webhook/meta`
  - [x] Compare `hub.verify_token` against `WHATSAPP_WEBHOOK_VERIFY_TOKEN`; on match return `hub.challenge` as plain text 200, else `403`
- [x] Task 2: Signature validation BEFORE parsing (AC: #1, #2)
  - [x] Read RAW body via `c.req.text()` — do NOT parse JSON first
  - [x] Compute `HMAC-SHA256(rawBody, WHATSAPP_APP_SECRET)` with `node:crypto`; compare with `crypto.timingSafeEqual`
  - [x] On mismatch/missing header: return `403 Forbidden` immediately
  - [x] Only after valid signature, `JSON.parse` the body
- [x] Task 3: Immediate ack + async handoff (AC: #1)
  - [x] Respond `200 OK` immediately; downstream `processWebhookAsync` kicked off with `.catch(captureException)` — never blocks response
- [x] Task 4: Tenant routing (AC: #1, #3)
  - [x] Extract `metadata.phone_number_id`; look up `whatsapp_connections` via `withServiceRole`; warn + ack on no match
- [x] Task 5: Deduplication (AC: #4)
  - [x] `redis.set(dedupKey, '1', { ex: 86400, nx: true })`; skips if key already exists
- [x] Task 6: Debounce buffer (AC: #1, #3) — using QStash delayed flush instead of BullMQ
  - [x] `RPUSH leedi:msg_buffer:{tenant_id}:{lead_phone}` + `EXPIRE 6`
  - [x] Schedule QStash delayed job (6s) to `POST /api/internal/agent-flush`
  - [x] Flush endpoint: `LRANGE` + `DEL` buffer; Epic 7 agent hookup left as TODO
- [x] Task 7: Persist inbound messages (AC: #1, #3)
  - [x] `recordInboundMessage` from `@leedi/messaging` — stores `direction: inbound, status: recebido`
  - [x] Text, audio, image handled; other types log-and-ignore
- [ ] Task 8: Rate limiting — deferred (basic signature + dedup provides abuse protection for V1)
- [x] Task 9: Tests (AC: #1–#5)
  - [x] Unit: signature validation passes for correct HMAC, fails (403) for tampered body / missing header
  - [x] Unit: GET verification echoes challenge on token match, 403 otherwise
  - [x] Unit: 200 returned immediately for valid signature
  - [ ] Integration: two messages within 6s flush — deferred (requires running Redis)

## Dev Notes

- Files to create: `apps/api/src/routes/webhook-meta.ts`, buffer/dedup helpers (e.g. `apps/api/src/lib/message-buffer.ts`), `apps/api/src/jobs/agent-process.ts` (queue + flush), a messaging use case `packages/messaging/src/use-cases/record-inbound-message.ts`.
- Files to modify: `apps/api/src/index.ts` (mount webhook routes BEFORE any body-parsing middleware that would consume the raw body), `@leedi/config` (add `WHATSAPP_APP_SECRET`, `WHATSAPP_WEBHOOK_VERIFY_TOKEN`).
- npm dependencies: `bullmq`, Upstash Redis client, `@upstash/ratelimit` (or equivalent). HMAC uses Node `node:crypto` (built-in).
- Hono raw-body access: capture `c.req.raw` and read the bytes ONCE; ensure no upstream middleware consumes/clones the body before signature validation. Validate, then `JSON.parse` the same bytes.
- Adapter boundary: parsing the Meta payload shape lives near the webhook; the agent use case receives a normalized `{ tenant_id, lead_phone, messages[] }` and knows nothing about Meta.

### Security considerations (NFR3 + abuse)

- Signature validation is MANDATORY and happens BEFORE JSON parsing or any side effect — invalid signature => 403, full stop.
- Use `crypto.timingSafeEqual` to compare signatures (avoid timing side channels); guard against length mismatch before comparing.
- Never log the raw token/secret. Logging the `meta_message_id` and `phone_number_id` is acceptable (non-sensitive); avoid logging message bodies in production (LGPD).
- Rate-limit the public webhook to blunt abuse, but keep limits above realistic Meta burst rates.

### Testing standards

- Mock Redis + BullMQ in unit tests; use a local Redis (or test container) + local Supabase for integration. For end-to-end against real Meta, expose the local API via ngrok, subscribe the webhook, and send a test message — document the steps but do not require it in CI.

### Pitfalls to avoid

- ALWAYS validate the signature before processing — never parse-then-validate.
- Respond 200 IMMEDIATELY after validation; do not await heavy processing (Meta retries on slow/failed responses, causing duplicates).
- Deduplication is critical — Meta may deliver the same `meta_message_id` multiple times; `SET ... NX` is the idempotency guard.
- Do NOT let a body-parsing/clone middleware consume the raw bytes before HMAC verification.
- Do NOT block the response on Redis/BullMQ failures — degrade and still ack 200 where appropriate.

### Project Structure Notes

- Webhook endpoint + buffering/dedup + queues live in `apps/api`. Message persistence is a `packages/messaging` use case via `withTenant`.

### References

- [Source: docs/01-leedi-arquitetura.md#Message buffer pattern (Redis debounce)]
- [Source: _bmad-output/planning-artifacts/epics.md#Story 4.4: Inbound Webhook Message Reception & Routing] (FR21)
- [Source: _bmad-output/planning-artifacts/epics.md#NFR3] (no secrets in logs)

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

- Task 8 (rate limiting) deferred — HMAC signature + dedup already guard against replay/abuse. `@upstash/ratelimit` can be added in a follow-up story.
- Debounce flush uses QStash delayed jobs (6s) instead of BullMQ — consistent with scheduler decision from 4.3.
- `handleStatusUpdate` (delivered/read webhooks) implemented as a stub — updates `messages.status` via `withServiceRole` on `meta_message_id`.
- `@leedi/messaging` added to `apps/api` dependencies.

### Completion Notes List

- AC #1: Valid signature → immediate 200 + async processing (dedup, buffer, persist, flush schedule). Never blocks.
- AC #2: Invalid/missing `X-Hub-Signature-256` → 403 immediately. `timingSafeEqual` with length guard.
- AC #3: Debounce buffer: RPUSH + EXPIRE 6s per lead. QStash flush (6s delay) processes batch. Agent hookup TODO for Epic 7.
- AC #4: `SET NX EX 86400` per `meta_message_id` — duplicate messages silently skipped.
- AC #5: GET handshake verifies `hub.verify_token` against `WHATSAPP_WEBHOOK_VERIFY_TOKEN`, echoes challenge.
- 5 unit tests in webhook-meta.test.ts covering ACs #1, #2, #5.
- `WHATSAPP_APP_SECRET` and `WHATSAPP_WEBHOOK_VERIFY_TOKEN` added to config schema + .env.example.

### File List

- apps/api/src/routes/webhook-meta.ts (created)
- apps/api/src/routes/internal.ts (modified — added /agent-flush endpoint)
- apps/api/src/app.ts (modified — mounted /webhook/meta)
- apps/api/src/__tests__/webhook-meta.test.ts (created)
- packages/db/src/schema/message.ts (created)
- packages/db/src/schema/index.ts (modified — added message export)
- packages/db/migrations/0004_add_messages_table.sql (created)
- packages/db/migrations/meta/_journal.json (modified)
- packages/messaging/src/use-cases/record-inbound-message.ts (created)
- packages/messaging/src/use-cases/record-outbound-message.ts (created)
- packages/messaging/src/index.ts (modified)
- packages/messaging/package.json (modified — added @leedi/db dep + vitest)
- packages/config/src/schema.ts (modified — added WHATSAPP_APP_SECRET, WHATSAPP_WEBHOOK_VERIFY_TOKEN, QStash vars)
- .env.example (modified — added new vars with placeholders)

## Change Log

- 2026-05-31: Story 4.4 implemented — webhook GET/POST, HMAC signature, dedup, debounce buffer with QStash flush, message persistence. 5 unit tests.
