# Epic 5 — Code Review Report

- **Epic:** 5 — Lead Management & Conversation Windows
- **Stories reviewed:** 5.1 → 5.5 (all in `review`)
- **Reviewer:** Claude (Opus 4.8) via `bmad-code-review`
- **Date:** 2026-06-10
- **Communication:** PT-BR (chat) · EN (this document)
- **Method:** single-session adversarial implementation-vs-spec audit at **current working tree**,
  playing all three reviewer layers inline (Blind Hunter / Edge Case Hunter / Acceptance
  Auditor). Each story's File List was opened on disk and audited against its ACs + `epics.md`.
  All runnable suites were **executed**, not merely read; the two headline findings were
  **fixed and re-run green** in this session.

> **Method note — degraded "Blind Hunter" lens.** The three layers were played by one
> reviewer who had already read the specs, so nothing was reviewed truly *cold*. The
> baseline `992b842` resolves again (hashes were repaired in `460a15c`), but the Epic 5
> code is squashed into `8fa505f` together with epics 3/4, and a working-tree diff vs the
> baseline drags in every later epic (6→20) that touched shared paths (`packages/db/src/schema`,
> `packages/lead`, `apps/api`). A commit-scoped diff was therefore noisy and unreliable; the
> audit is **spec → claim → code → test**, story by story, scoped to each story's File List.

---

## 1. Verdict: 🟢 Ship-ready after 2 fixes (both applied & verified this session)

No production-blocking defect. Two real gaps were found and fixed; the remainder are
deferred operational/perf items, none of which block the stories' ACs.

| Story | Summary | Outcome |
|-------|---------|---------|
| **5.1** Lead schema + list view | Schema §6.3 complete, RLS ENABLE+FORCE on all 3 tables, `UNIQUE(tenant_id, telefone)`, `pageSize` capped at 100, filters synced to URL. Solid. | ✅ done |
| **5.2** Lead detail + journey timeline | Profile/tags/timeline DESC, optout banner driven strictly by `status`, empty-state copy, UUID guard → 404. **conversationCount was hard-coded 0** (F1) → fixed. | ✅ done |
| **5.3** CSV import | papaparse, E.164 normalize, two-level dedup (in-file + DB `onConflictDoNothing`), 5MB guard, partial-success errors, LGPD count-only logging. | ✅ done |
| **5.4** Tags & opt-out | Status flip + journey event in ONE tx, `operadorId` from session never body, triple-scoped delete, `list-dispatch-targets` LGPD seam (`status = 'ativo'`). | ✅ done |
| **5.5** Conversation windows (24h billing unit) | Atomic `message_count` increment, correct 24h boundary, partitioned `messages` (id, created_at), Redis-authoritative dedup. **Webhook integration test was red** (F2) → fixed. | ✅ done |

---

## 2. Test / typecheck execution (this session, after fixes)

| Suite | Result |
|-------|--------|
| `@leedi/lead` (`vitest run`) | **36 passed** (7 files; +1 from the new conversationCount test) |
| `@leedi/lead` (`tsc --noEmit`) | **clean** |
| `@leedi/messaging` (`vitest run`) | **6 passed** (window logic: 5.5 AC#1–3) |
| `apps/api` `webhook-meta.test.ts` | **5 passed** (was 5 failed — see F2) |

**Verification confidence:**
- **Test-verified:** lead use cases (5.1–5.4 logic), messaging window logic (5.5 AC#1–3),
  webhook GET/POST handshake + signature + 200-ack (5.5 wiring), UI AC copy strings.
- **Read-only-verified (NOT executed here):** RLS isolation and partition structure
  (`pg_inherits`) — both require a non-superuser local Supabase and are flagged *unchecked*
  in the stories themselves (5.1 Task 4, 5.5 Task 5). Migrations were applied to Supabase at
  implementation time per the stories' completion notes, but were not re-proven this session.

> **Out of scope (other epics, same root cause as F2):** `process-dispatch-batch.test.ts`
> and `handle-quality-update.test.ts` (Epic 13) and `health.test.ts` also fail at import
> because `@leedi/notification` runs `webpush.setVapidDetails(env.VAPID_SUBJECT…)` at module
> load with empty test env. These belong to their own epics' reviews — **not** Epic 5 findings.

---

## 3. Findings

### F1 — [MEDIUM · PATCH · FIXED] Story 5.2 AC#1: conversation count permanently 0

`packages/lead/src/use-cases/get-lead-detail.ts` returned `conversationCount: 0`
hard-coded with a `TODO(Story 5.5)`. Story 5.2 AC#1 requires the detail page to show the
conversation count and the UI renders it (`lead-detail-client.tsx:461`). Story 5.5 has
since landed `conversation_windows`, so the dependency the TODO waited on is satisfied — but
the count was never wired, so every lead showed "0 conversas" regardless of history.

**Fix:** `getLeadDetail` now runs a tenant-scoped `count(*)` over `conversation_windows`
filtered by `lead_id` inside the same `withTenant` transaction. The unit test's stale
"always 0" assertion was replaced by two tests proving the real count is read (`= 3`) and
that it defaults to 0 when no window rows exist. `tsc` clean.

### F2 — [MEDIUM · PATCH · FIXED] Story 5.5: webhook integration suite red (stale mocks)

`apps/api/src/__tests__/webhook-meta.test.ts` (in Story 5.5's File List) failed all 5 tests
at import time. Root cause: Epic 16 later wired `checkUsageBlock` / `incrementUsage`
(`@leedi/usage`) and `sendNotificationToTenantRole` (`@leedi/notification`) into
`processMessage`, but the suite's mocks were never updated. Importing `webhook-meta`
pulled in the real `@leedi/notification`, whose `push-provider.ts` calls
`webpush.setVapidDetails(env.VAPID_SUBJECT, …)` at module load and throws on the empty test
env. This is a **structurally stale test**, not merely an env quirk — proven by the fact
that adding the two missing module mocks (not env vars) turns the suite green.

**Fix:** added `vi.mock('@leedi/usage', …)` and `vi.mock('@leedi/notification', …)` to the
suite. 5/5 green. Story 5.5's webhook wiring is now test-verified rather than eyeballed.

> Blame note: the breakage *originates* in Epic 16's un-mocked additions, but the decision
> under review is whether 5.5 can be `done`, and 5.5 owns this test file. Fixing the mock is
> the correct unblock — penalizing 5.5 for Epic 16's omission would be wrong.

### F3 — [LOW · DEFER] Outbound message updates scan all partitions

`record-outbound-message.ts` `markSent`/`markFailed` and `webhook-meta.ts`
`handleStatusUpdate` UPDATE `messages` by `id` / `meta_message_id` alone. The table is
range-partitioned on `created_at` (PK `(id, created_at)`), so without `created_at` in the
WHERE there is **no partition pruning** — every partition is scanned. Correct, just
increasingly slow as partitions accumulate. Pre-existing partitioning tradeoff; revisit when
adding partition count grows. Deferred.

### F4 — [MEDIUM · DEFER → pre-launch] messages partitions end 2026-08-31

Migration `0006` creates partitions for `2026_06`, `2026_07`, `2026_08` only. An inbound
message with `created_at >= 2026-09-01` has **no partition** and the insert throws; in the
webhook path `processMessage(...).catch(captureException)` swallows it → **silent message
loss** after Aug 31, 2026. Mitigation is the rolling-partition maintenance job (scheduled
Supabase Edge Function, owned by Epic 16 per project notes). Story 5.5 AC#4 only requires
that partitioning *exists* (it does), so this does not block 5.5 — but it is an operational
launch-gate. Tracked in `pendencias-pre-launch.md`.

### F5 — [LOW · DEFER] CSV phone normalization over-accepts non-mobile numbers

`parse-leads-csv.ts#normalizeToE164` prefixes `+55` only for 11-digit non-`55` strings;
anything else (e.g. a 10-digit BR landline `DDD`+8) falls through to `+${digits}` and passes
the `^\+\d{10,15}$` check as "valid" E.164 while being semantically wrong (no country code).
Acceptable V1 heuristic for the BR-mobile default (11 digits); a stricter `libphonenumber-js`
pass can be added later. Deferred.

### F6 — [LOW · DEFER] `ultima_interacao` is never refreshed on inbound

`findOrCreateLeadByPhone` returns early for an existing lead and never bumps
`ultima_interacao`; neither `saveMessage` nor `resolveConversationWindow` touch the `leads`
row. So `ultima_interacao` freezes at creation time, yet the list view sorts
`ultima_interacao DESC NULLS LAST` — active leads will not float to the top. No Epic 5 AC
mandates updating it (it is a product-completeness gap, not an AC violation), so deferred;
worth a one-line task for the messaging/agent epic that owns inbound side effects.

### Dismissed as noise

- Duplicate manual tags allowed (no `UNIQUE(lead_id, tag)`) — no AC requires tag dedup.
- `recordOutboundMessage` inserts in `'enviado'` and `markSent` re-sets `'enviado'` — a
  no-op on status; pre-existing Epic 4 enum design, harmless.

---

## 4. Triage summary

> **0** `decision-needed` · **2** `patch` (both fixed) · **4** `defer` · **2** dismissed.

All `patch` findings resolved and re-run green. No unresolved HIGH/MEDIUM code defects remain
in Epic 5 logic (F4 is a deferred operational dependency, tracked pre-launch). **All five
stories → `done`.**
