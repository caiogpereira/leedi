# Story 4.4: Inbound Webhook Message Reception & Routing

Status: ready-for-dev

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

- [ ] Task 1: Webhook verification (GET) endpoint (AC: #5)
  - [ ] Create `apps/api/src/routes/webhook-meta.ts` with `GET /webhook/meta`
  - [ ] Compare `hub.verify_token` against `WHATSAPP_WEBHOOK_VERIFY_TOKEN` (from `@leedi/config`); on match return `hub.challenge` as plain text 200, else `403`
- [ ] Task 2: Signature validation BEFORE parsing (AC: #1, #2)
  - [ ] In `POST /webhook/meta`, read the RAW body via `c.req.raw` (raw bytes) — do NOT parse JSON first
  - [ ] Compute `HMAC-SHA256(rawBody, WHATSAPP_APP_SECRET)`; compare to the `X-Hub-Signature-256` header (`sha256=` prefix) using a timing-safe comparison (`crypto.timingSafeEqual`)
  - [ ] On mismatch/missing header: return `403 Forbidden` immediately, no parsing, no enqueue
  - [ ] Only after a valid signature, parse the JSON body
- [ ] Task 3: Immediate ack + async handoff (AC: #1)
  - [ ] After signature validation, respond `200 OK` immediately; perform buffering/dedup without blocking the response (do the enqueue, then return — keep it fast)
  - [ ] Wrap downstream work so a failure never delays/blocks the 200 (Meta retries on non-200/slow responses)
- [ ] Task 4: Tenant routing (AC: #1, #3)
  - [ ] Extract `metadata.phone_number_id` from the webhook payload; look up `whatsapp_connections` by `phone_number_id` to resolve `tenant_id`
  - [ ] If no matching connection: log a warning with `phone_number_id` (not sensitive) and ack 200 (still discard work)
- [ ] Task 5: Deduplication (AC: #4)
  - [ ] For each message, `SET leedi:msg_seen:{meta_message_id} 1 EX 86400 NX`; if the key already exists (NX fails), skip that message
- [ ] Task 6: Debounce buffer (AC: #1, #3)
  - [ ] `RPUSH leedi:msg_buffer:{tenant_id}:{lead_phone} <message_json>` then `EXPIRE ... 6`
  - [ ] A separate BullMQ flush mechanism detects inactivity (6s) and flushes the buffered list as one batch (e.g. delayed job re-scheduled on each new message, or a poller on expired buffers); on flush, `LRANGE` + `DEL` and enqueue one `agent-process` job
  - [ ] `agent-process` job data: `{ tenant_id, lead_phone, messages[] }`
- [ ] Task 7: Persist inbound messages (AC: #1, #3)
  - [ ] After routing, store each message in the `messages` table with `direction: inbound`, `status: recebido`, `meta_message_id`, `content`, `tenant_id` (via a messaging use case / `withTenant`)
  - [ ] Handle message types `text`, `audio`, `image`; log-and-ignore other types
- [ ] Task 8: Rate limiting (NFR / abuse protection)
  - [ ] Apply a rate limiter to `POST /webhook/meta` (per-IP / sliding window via Upstash) to prevent abuse, sized generously so legitimate Meta bursts are not throttled
- [ ] Task 9: Tests (AC: #1–#5)
  - [ ] Unit: signature validation passes for a correct HMAC and fails (403) for a tampered body / wrong secret; uses timing-safe compare
  - [ ] Unit: GET verification echoes challenge on token match, 403 otherwise
  - [ ] Unit: dedup — second identical `meta_message_id` is skipped
  - [ ] Integration: two messages within 6s flush as one batch with both messages
  - [ ] Integration: webhook responds 200 fast even when downstream enqueue is slow/mocked-failing
  - [ ] Local manual test via ngrok against the Meta sandbox (documented in Dev Notes)

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

### Completion Notes List

### File List
