# Epic 4 — Code Review Report

- **Epic:** 4 — WhatsApp Channel Connection
- **Stories reviewed:** 4.1 → 4.5 (all in `review`)
- **Reviewer:** Claude (Opus 4.8) via `bmad-code-review`
- **Date:** 2026-06-09
- **Communication:** PT-BR (chat) · EN (this document)
- **Method:** single-session adversarial implementation-vs-spec audit at **current HEAD**,
  playing all three reviewer layers inline (Blind Hunter / Edge Case Hunter / Acceptance
  Auditor). The `baseline_commit` recorded in every Epic 4 story (`992b8421…`) was
  **invalidated by the git-history secret purge** (commit `460a15c`) — it no longer resolves
  (`git cat-file -t` → *Not a valid object name*), so a commit-diff review was impossible.
  Each story's File List was opened on disk and audited against `epics.md` (the source spec).
  The headline finding was **proven against the live Supabase database** (not just recalled),
  and all runnable suites were **executed**, not merely read.

---

## 1. Scope & method

Epic 4 has no isolated per-story commits available (epics 3/4/5 were squashed into `8fa505f`
and history was later rewritten), so the audit is **spec → claim → code → test → live DB**,
story by story:

1. Read each story's ACs + Tasks + Dev Notes + Completion Notes + File List.
2. Open every file the story claims to have created/modified; confirm it matches the claim.
3. Cross-check the AC against `epics.md#Epic 4` (FR17, NFR3, NFR8).
4. **Run** the test + typecheck suites and, for the headline bug, **execute SQL against the
   production Supabase project** to prove the defect and validate the fix target.

### Live-DB verification (this session)

| Check | Result |
|-------|--------|
| `whatsapp_quality_rating` enum labels | `{verde, amarelo, vermelho}` (confirmed) |
| `whatsapp_messaging_tier` enum labels | `{1k, 10k, 100k, unlimited}` (confirmed) |
| `SELECT 'GREEN'::whatsapp_quality_rating` | **ERROR 22P02 — invalid input value for enum** ← proves Finding 1 |
| `messages` table columns | `autor`, `tipo`, `conversation_window_id`, `lead_id`, `midia_url`, … all present → 4.4 `saveMessage` path is runtime-safe |

### Test / typecheck execution (this session, at HEAD, **after** fixes)

| Suite | Result |
|-------|--------|
| `@leedi/connection` (`vitest run`) | **29 passed** (6 files; +7 new mapper tests, +reinforced use-case assertions) |
| `@leedi/connection` (`tsc --noEmit`) | **clean** (was failing — see Finding 3) |
| `@leedi/api` (`tsc --noEmit`) | webhook-meta change is **clean**; remaining errors are **later-epic debt** (campaign/billing/knowledge/notification) — none in Epic 4 files |

---

## 2. Verdict: 🟠 One production-blocking defect (now fixed) + minor cleanups

Story-by-story summary at HEAD:

- **4.1** Schema + AES-256-GCM envelope encryption + `WhatsAppProvider` port + `MetaCloudProvider`.
  Crypto is **solid**: per-record DEK wrapped by KEK, authenticated (GCM tag verified on decrypt,
  tampering throws), no plaintext in logs, private `#` fields + redacting `toJSON()`. RLS enabled +
  **forced** with the `tenant_isolation` policy. ✅ Verified.
- **4.2** `connectWhatsappNumber` (validate-before-persist invariant is correct — no DB write on
  bad credentials), Hono route with session + owner check, server-action form with green badge +
  inline error + token-clear-on-error + a11y (`role=status`/`alert`, labels, `aria-busy`). ✅ —
  **except** the persisted quality/tier values (Finding 1).
- **4.3** `checkConnectionHealth` + `/health-check` route + `HealthPanel`. Display layer
  (`health-display.ts`) defensively handles **both** Meta-raw and domain values. ✅ — **except** the
  persisted values (Finding 1) and a misleading authz comment (Finding 4).
- **4.4** Webhook GET handshake + POST with **HMAC verified on raw bytes via `timingSafeEqual`**
  (length-checked) **before** parsing, dedup via Redis `SET NX`, debounce buffer + QStash flush.
  Signature discipline is correct. ✅ — minor URL-derivation nit (Finding 2).
- **4.5** `sendText`/`sendTemplate` with exponential backoff (429/5xx, honors `Retry-After`),
  outbound message recording. ✅ Verified.

---

## 3. Findings & resolutions

Severity: **HIGH** = breaks a shipped flow / security · **LOW** = correctness/maintainability nit
· **INFO** = observation. Disposition follows the skill triage buckets.

### 🔴 Finding 1 — [HIGH][Patch ✅ FIXED] Meta `quality_rating` / `messaging_limit_tier` written raw into pt-BR pgEnums → connect & health-check throw `22P02` in production

- **Stories:** 4.2 (connect), 4.3 (health-check). **Source:** auditor + edge.
- **Locations:**
  `packages/connection/src/use-cases/connect-whatsapp-number.ts` (insert `.values` + `.set`),
  `packages/connection/src/use-cases/check-connection-health.ts` (`.set`).
- **Detail:** Meta's Graph API returns `quality_rating` as `GREEN | YELLOW | RED | UNKNOWN` and
  `messaging_limit_tier` as `TIER_1K | TIER_10K | TIER_100K | TIER_UNLIMITED | TIER_50 | TIER_250`.
  The DB pgEnums are the domain forms (`verde/amarelo/vermelho`, `1k/10k/100k/unlimited`). The code
  passed Meta's raw strings straight into the enum columns behind an `as 'verde' | …` cast — a
  **compile-time no-op** that does no conversion. Postgres rejects the write with
  `invalid input value for enum whatsapp_quality_rating: "GREEN"` (SQLSTATE 22P02), so **connecting a
  real WhatsApp number fails at the INSERT** even though Meta validation succeeded, and the scheduled
  health-check throws on every run.
- **Why the tests didn't catch it:** the unit tests mock `@leedi/db` (no real Postgres) and the
  "returns token-free response" test only asserts the **returned** object (which keeps Meta's raw
  value, fine) — never the **stored** value. Classic mock-masks-the-bug. `health-display.ts` already
  tolerated `green`/`tier_1k`, which is the tell that someone knew Meta returns English but only the
  read path got the memo.
- **Proof:** `SELECT 'GREEN'::whatsapp_quality_rating` on the live DB → `ERROR 22P02`.
- **Fix:** added `packages/connection/src/adapters/meta-mappers.ts` exporting `mapQualityRating` /
  `mapMessagingTier` (case-insensitive, **`null` default** for `UNKNOWN`/`TIER_50`/`TIER_250`/unexpected
  — the columns are nullable), symmetric with `health-display.ts`. Applied in both use-cases before
  the DB write; the returned result still carries Meta's raw value (no type ripple to route/actions/
  form). Exported from the package index so Epic 13's `handle-quality-update.ts` (same latent bug,
  **not touched here**) can reuse it. Added `meta-mappers.test.ts` (GREEN→verde, TIER_1K→1k,
  UNKNOWN→null, TIER_50→null, idempotent, case-insensitive) and reinforced both use-case tests to
  assert the **mapped** value reaches the DB.

### 🟡 Finding 2 — [LOW][Patch ✅ FIXED] `webhook-meta.ts` hardcodes `:3003` for the internal API URL

- **Story:** 4.4. **Location:** `apps/api/src/routes/webhook-meta.ts:346`.
- **Detail:** the QStash flush URL was derived via `env.BETTER_AUTH_URL.replace(':3000', ':3003')`
  with a **hardcoded** `:3003`, while ~40 other sites in the codebase use the project convention
  `env.BETTER_AUTH_URL.replace(':3000', \`:${env.API_PORT}\`)`. Inconsistent and breaks if `API_PORT`
  is overridden.
- **Fix:** changed to `\`:${env.API_PORT}\`` to match the convention. (The broader fragility of the
  `replace(':3000', …)` pattern in production is recorded as Finding 5 / deferred-work — out of scope.)

### 🟡 Finding 3 — [LOW][Patch ✅ FIXED] Epic 4 connection test fakeProviders missing `submitTemplate` → `tsc --noEmit` fails (CI gate)

- **Stories:** 4.2/4.3 tests. **Locations:** `connect-whatsapp-number.test.ts`,
  `check-connection-health.test.ts`.
- **Detail:** a later epic (12.x, template submission) added `submitTemplate` to the `WhatsAppProvider`
  port; the Epic 4 test `fakeProvider` literals were never updated, so they no longer satisfy the
  interface and `tsc --noEmit` (the real CI gate) failed on 6 lines. `vitest` ignored it (esbuild
  strips types). Pre-existing, surfaced in Epic 4 files.
- **Fix:** added `submitTemplate: vi.fn()` to each fake provider. `tsc --noEmit` now clean.

### 🟡 Finding 4 — [LOW][Patch ✅ FIXED] Misleading authz comment on `/health-check`

- **Story:** 4.3. **Location:** `apps/api/src/routes/whatsapp.ts`.
- **Detail:** the route comment said `(owner | operator)` but the handler uses `requireTenantSession()`
  with **no** role argument — any authenticated tenant member can call it. The behavior (any member may
  refresh; effect is read-only on Meta and RLS-scoped to the caller's own row) is acceptable; the
  comment was wrong.
- **Fix:** corrected the comment to state actual behavior. No behavior change.

### ⚪ Finding 5 — [INFO][Defer] `BETTER_AUTH_URL.replace(':3000', …)` breaks in production without a `:3000` port

- **Story:** cross-cutting (introduced by 4.4's pattern, now in ~40 sites). **Disposition:** deferred.
- **Detail:** all internal API URLs are derived by string-replacing `:3000` in `BETTER_AUTH_URL`. In a
  production URL with no `:3000` (e.g. `https://app.leedi.com`) the replace is a no-op and the derived
  URL points at the wrong host. Not an Epic 4-specific defect to fix here (would touch ~40 files); the
  proper fix is a dedicated `INTERNAL_API_URL` / `API_BASE_URL` env var. Recorded in `deferred-work.md`.

### ⚪ Finding 6 — [INFO][Dismiss] Migration `0004` shape differs from `message.ts`

- **Story:** 4.4. **Disposition:** dismissed (not a defect).
- **Detail:** `0004_add_messages_table.sql` creates the *original* messages shape (`conversation_id`,
  `lead_phone`, global `UNIQUE(meta_message_id)`). The current `message.ts` schema (`autor`, `tipo`,
  `conversation_window_id`, `lead_id`, partitioned) is the **Story 5.5 reconciliation** applied by a
  later migration. The **live** `messages` table was verified to have the reconciled columns, so the
  4.4 `saveMessage` path works at runtime. Expected migration evolution, not a bug.

---

## 4. Edge cases noted (no fix required this epic)

- **Debounce TTL race (4.4):** the buffer key TTL is 6 s and the QStash flush is also scheduled at
  +6 s; under clock skew the `lrange` may find an expired (empty) buffer. Inbound messages are still
  persisted via `saveMessage` immediately, and the flush consumer is Epic 7 territory. Low risk —
  noted for the Epic 7 agent-loop review.
- **`record-inbound-message` vs `saveMessage` (4.4/4.5):** the webhook uses `saveMessage`;
  `recordInboundMessage` appears partially superseded. `recordOutboundMessage` is used by 4.5. No
  defect — flagged for dead-code follow-up.

---

## 5. Files changed by this review

- `packages/connection/src/adapters/meta-mappers.ts` (**created**)
- `packages/connection/src/__tests__/meta-mappers.test.ts` (**created**)
- `packages/connection/src/use-cases/connect-whatsapp-number.ts` (mapped quality/tier before write)
- `packages/connection/src/use-cases/check-connection-health.ts` (mapped quality/tier before write)
- `packages/connection/src/index.ts` (export mappers for reuse)
- `packages/connection/src/__tests__/connect-whatsapp-number.test.ts` (assert mapped DB value + `submitTemplate`)
- `packages/connection/src/__tests__/check-connection-health.test.ts` (assert mapped DB value + `submitTemplate`)
- `apps/api/src/routes/webhook-meta.ts` (`:3003` → `:${env.API_PORT}`)
- `apps/api/src/routes/whatsapp.ts` (corrected authz comment)

## 6. Tally

| Bucket | Count |
|--------|-------|
| `decision-needed` | 0 |
| `patch` (fixed this session) | 4 (Findings 1–4) |
| `defer` | 1 (Finding 5) |
| `dismiss` | 1 (Finding 6) |
| Edge cases noted | 2 |

**No HIGH/MEDIUM issues remain unresolved.** Story status transition (`review` → `done`) is pending
user confirmation per the project's sprint workflow (never auto-skip to `done`).
