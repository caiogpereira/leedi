---
baseline_commit: 992b842
---

# Story 5.5: Conversation Window Tracking — 24h Billing Unit

Status: done

## Story

As a developer,
I want conversation windows to be created and managed correctly as the 24h billing unit,
so that usage metering has accurate data and the agent has proper conversation context.

## Acceptance Criteria

1. **Given** a lead sends a message and no open `conversation_window` exists for that lead+tenant, **When** the inbound message use case runs, **Then** a new `conversation_windows` row is created with `started_at: now()`, `billable: true`, `message_count: 1`, **And** a `messages` row is created linked to the new window.
2. **Given** a lead sends a message and an open window exists (`started_at` within the last 24h, `ended_at` is null), **When** the inbound message use case runs, **Then** the existing window is reused (no new window), **And** `message_count` is incremented atomically.
3. **Given** a lead sends a message more than 24h after `started_at` of the last open window, **When** the message use case runs, **Then** the previous window's `ended_at` is set to now(), **And** a new window is created with `billable: true`.
4. **Given** the messages table grows to large volumes, **When** queried, **Then** the table is partitioned by month (`created_at`) per Architecture spec — verified by checking `pg_inherits` / partition definition.
5. **Given** a playground session creates a conversation window, **When** the window is created, **Then** `billable` is set to `false` and no `usage_counter` is incremented (this story only covers the flag; metering is Epic 16).

## Tasks / Subtasks

- [x] Task 1: DB migration `0006_messaging_conversation_windows_partition.sql` (AC: #1-5)
  - [x] `packages/db/src/schema/messaging.ts` — conversationWindows + inboxAssignments with all §6.4 columns + FKs
  - [x] `packages/db/src/schema/message.ts` — reconciled: removed leadPhone/conversationId, added conversationWindowId, leadId, autor, tipo, midiaUrl, transcricao, metadata; metaMessageId no longer globally unique
  - [x] `packages/db/src/schema/index.ts` — added `export * from './messaging.js'`
  - [x] Migration applied to Supabase via MCP: messages empty (verified), drop-recreate approach
  - [x] messages PK = (id, created_at); UNIQUE INDEX (meta_message_id, created_at) WHERE NOT NULL (not global)
  - [x] RLS ENABLE+FORCE on all 3 tables; updated_at trigger on inbox_assignments
  - [x] 3 partitions created: messages_2026_06, messages_2026_07, messages_2026_08
- [x] Task 2: `resolve-conversation-window` use case (AC: #1, #2, #3, #5)
  - [x] `packages/messaging/src/use-cases/resolve-conversation-window.ts` — injectable nowFn for testing; atomic message_count increment via UPDATE RETURNING; 24h check in JS (exact > boundary)
- [x] Task 3: `save-message` use case (AC: #1)
  - [x] `packages/messaging/src/use-cases/save-message.ts` — inserts into partitioned messages table, returns id
- [x] Task 4: Wired into inbound handler (AC: #1, #2, #3)
  - [x] `packages/lead/src/use-cases/find-or-create-lead-by-phone.ts` — SELECT then INSERT with onConflictDoNothing, returns {id, telefone, isNew}
  - [x] `record-inbound-message.ts` — leadPhone→leadId + conversationWindowId; removed onConflictDoNothing meta_message_id target
  - [x] `record-outbound-message.ts` — leadPhone→leadId, conversationId→conversationWindowId, autor: 'agente'
  - [x] `webhook-meta.ts` — new flow: findOrCreateLeadByPhone → resolveConversationWindow → saveMessage; resolveTenantId now returns {tenantId, connectionId}; mapMessageType helper
- [x] Task 5: Tests (AC: #1, #2, #3)
  - [x] 6 messaging tests (resolve-conversation-window 4 + save-message 2) — all pass
  - [x] Epic 4 record-inbound/outbound tests updated and passing (23 api tests total)
  - [ ] Integration test (partition verification via pg_inherits) — requires non-superuser local Supabase; partition structure verified manually via MCP execute_sql instead

## Dev Notes

- Files to create: `packages/db/src/schema/messaging.ts`, the next sequential migration in `packages/db/migrations/` (currently `0006_*.sql`), `packages/messaging/src/use-cases/resolve-conversation-window.ts`, `packages/messaging/src/use-cases/save-message.ts`, and (in `@leedi/leads`) `find-or-create-lead-by-phone.ts`.
- Files to modify: `packages/db/src/schema/index.ts` (export messaging), `packages/db/src/schema/message.ts` (reconcile or fold into messaging.ts), `packages/db/migrations/meta/_journal.json` (drizzle-kit), `packages/messaging/src/index.ts` (new exports), `packages/messaging/src/use-cases/record-inbound-message.ts` + `record-outbound-message.ts` (update to reconciled schema), `apps/api/src/routes/webhook-meta.ts` + `apps/api/src/routes/internal.ts` (wire window + lead resolution).
- npm dependencies: none new. Raw SQL for partitioning goes in the migration (drizzle-kit cannot express `PARTITION BY RANGE`); define the Drizzle `messages` model as a normal table and hand-author the partition DDL.
- IMPORTANT divergence from the original task brief: the brief assumed `messages` did not exist yet and would be created here as `0005`. In reality `messages` already exists (migration `0004_add_messages_table`, Epic 4) with a simpler shape and is actively written by `@leedi/messaging` use cases that `webhook-meta.ts` calls. This story is therefore a RECONCILE + PARTITION, not a greenfield create. Migration numbering: 0004=messages (existing), 0005=leads (Story 5.1), 0006=messaging/this story.
- Cross-story dependency: this migration FKs to `leads`, so Story 5.1's migration (0005) must be applied first.
- Architecture notes: `conversation_windows` is the 24h billing unit (Architecture §6.4). The 24h window logic is the metering foundation for Epic 16 — this story only sets `billable`; no `usage_counter` increment here.

### Testing standards

- Unit tests with vitest; use fake timers / injectable `now` to assert the 24h boundary (within → reuse, beyond → close+new) without real waits. Mock `withTenant`/transaction or assert the composed statements.
- Integration against local Supabase to verify the partition (`pg_inherits` / `pg_partitioned_table`) and RLS. Same non-superuser app-role caveat as existing RLS tests.

### Pitfalls to avoid

- Partitioned tables require the partition key in EVERY PK/UNIQUE → PK becomes `(id, created_at)` and the `meta_message_id` UNIQUE becomes `(meta_message_id, created_at)`. Forgetting this fails the migration with "unique constraint must include all partitioning columns".
- DEDUP UNDER PARTITIONING: a global UNIQUE on `meta_message_id` is impossible once the table is partitioned — the partition key must be in the constraint, and `(meta_message_id, created_at)` does NOT enforce global uniqueness (the same `meta_message_id` with a different `created_at` would insert twice). The Redis `SET NX EX 86400` dedup from Story 4.4 is the AUTHORITATIVE idempotency guard — do NOT rely on the DB constraint for dedup. The existing `record-inbound-message.ts` uses `.onConflictDoNothing({ target: schema.messages.metaMessageId })`; that target ceases to be a valid global-unique constraint after partitioning and MUST be dropped or replaced, with dedup left to Redis.
- Partitioning is NOT an `ALTER TABLE ... PARTITION BY` — you must create a new partitioned table and move data (or drop+recreate in V1). Plan for missing future-month partitions (create current + next month; a later story/cron creates rolling partitions).
- The 24h window check is `started_at > now() - interval '24 hours' AND ended_at IS NULL`. Get the boundary right: exactly-24h-old should close + create new.
- `message_count` increment MUST be atomic (`SET message_count = message_count + 1` in SQL), never read-then-write in app code (race condition under the debounce/concurrent flush).
- Reconciling the enum: if you switch `inbound|outbound` → `entrada|saida`, you break `record-inbound-message.ts`, `record-outbound-message.ts`, and `webhook-meta.ts` — update them in THIS story or the API won't compile.
- Do NOT leave the existing `messages` writers pointing at the old shape after the reconcile — they must be updated and their Epic 4 tests must still pass.
- `billable: false` for playground/test sessions must be honored end-to-end so Epic 16 metering excludes them.

### Project Structure Notes

- Schema + partition DDL only in `packages/db`. Window/message use cases in `@leedi/messaging`. Lead find-or-create in `@leedi/leads`. Webhook wiring in `apps/api`. No cross-package internal imports — barrels only.

### References

- [Source: docs/01-leedi-arquitetura.md#6.4 Schema conversation_windows / messages / inbox_assignments]
- [Source: _bmad-output/planning-artifacts/epics.md#Story 5.5: Conversation Window Tracking — 24h Billing Unit]
- [Source: packages/db/migrations/0004_add_messages_table.sql] (existing messages table to reconcile)
- [Source: _bmad-output/implementation-artifacts/4-4-inbound-webhook-message-reception-routing.md] (inbound handler to wire into)

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6 (migration hand-authored + applied directly; use cases via fullstack-dev-specialist subagent)

### Debug Log References

_none_

### Completion Notes List

- messages table was confirmed empty (count=0) before drop-recreate — safe approach for v1
- 24h freshness check done in JS (not SQL WHERE) because the spec's "find window AND close stale window" steps are self-contradictory if the stale row is filtered out by SQL
- `message_count` increment is atomic (UPDATE SET message_count = message_count + 1 via RETURNING) — no read-modify-write
- `onConflictDoNothing({ target: schema.messages.metaMessageId })` removed from record-inbound-message — not valid after partitioning; Redis SET NX remains the authoritative dedup guard
- Drizzle models messages with `id` as PK (Drizzle perspective); actual DB PK is (id, created_at) — mismatch is documented in schema comment
- `resolveTenantId` renamed to `resolveTenantByPhoneNumberId` and returns `{ tenantId, connectionId }`

### File List

- `packages/db/src/schema/message.ts` (modified — reconciled schema)
- `packages/db/src/schema/messaging.ts` (new — conversationWindows + inboxAssignments)
- `packages/db/src/schema/index.ts` (modified — added messaging.js export)
- `packages/db/migrations/0006_messaging_conversation_windows_partition.sql` (new)
- `packages/messaging/src/use-cases/resolve-conversation-window.ts` (new)
- `packages/messaging/src/use-cases/save-message.ts` (new)
- `packages/messaging/src/use-cases/record-inbound-message.ts` (modified — reconciled schema)
- `packages/messaging/src/use-cases/record-outbound-message.ts` (modified — reconciled schema)
- `packages/messaging/src/use-cases/__tests__/resolve-conversation-window.test.ts` (new)
- `packages/messaging/src/use-cases/__tests__/save-message.test.ts` (new)
- `packages/messaging/src/index.ts` (modified — new exports)
- `packages/messaging/package.json` (modified — added @leedi/lead dep, test script)
- `packages/messaging/vitest.config.ts` (new)
- `packages/lead/src/use-cases/find-or-create-lead-by-phone.ts` (new)
- `packages/lead/src/use-cases/__tests__/find-or-create-lead-by-phone.test.ts` (new)
- `packages/lead/src/index.ts` (modified — findOrCreateLeadByPhone export)
- `apps/api/src/routes/webhook-meta.ts` (modified — new processMessage flow)
- `apps/api/src/__tests__/webhook-meta.test.ts` (modified — updated mocks)

### Change Log

- 2026-06-01: Story 5-5 implemented — messaging schema reconcile, messages partitioned (3 months), conversation windows + inbox assignments, inbound flow wired end-to-end

### Review Findings

_Code review 2026-06-10 (Opus 4.8, `bmad-code-review`). Full report: `epic-5-code-review-report.md`._

- [x] [Review][Patch] **Webhook integration suite was red — FIXED** [apps/api/src/__tests__/webhook-meta.test.ts] — Epic 16 wired `checkUsageBlock`/`incrementUsage` (`@leedi/usage`) and `sendNotificationToTenantRole` (`@leedi/notification`) into `processMessage`, but this suite's mocks were never updated; importing `webhook-meta` pulled in the real `@leedi/notification` whose `push-provider.ts` throws on `webpush.setVapidDetails` at load. Added the two missing `vi.mock` calls → 5/5 green. 5.5's webhook wiring is now test-verified.
- [x] [Review][Defer] Message UPDATEs scan all partitions [packages/messaging/src/use-cases/record-outbound-message.ts, apps/api/src/routes/webhook-meta.ts] — deferred, perf-only. `markSent`/`markFailed`/`handleStatusUpdate` filter by `id`/`meta_message_id` without `created_at`, so no partition pruning. Correct, just slower as partitions accumulate.
- [x] [Review][Defer] **messages partitions end 2026-08-31** [packages/db/migrations/0006_messaging_conversation_windows_partition.sql] — deferred to **pre-launch** (`pendencias-pre-launch.md`). Inbound after Aug 31 2026 has no partition → insert throws and `processMessage(...).catch(captureException)` swallows it = silent message loss. Mitigation = rolling-partition maintenance Edge Function (Epic 16). AC#4 only requires partitioning *exists* (it does), so this does not block the story.

✅ Verified: atomic `message_count` increment, correct 24h boundary (exactly-24h → close+new), Redis-authoritative dedup, partitioned PK `(id, created_at)`. Messaging tests 6 passed; webhook 5 passed. → **done**
