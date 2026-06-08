# Epic 1 — Code Review Report

- **Epic:** 1 — Project Foundation & Developer Infrastructure
- **Stories reviewed:** 1.1 → 1.8 (all in `review`)
- **Reviewer:** Claude (Opus 4.8) via `bmad-code-review`
- **Date:** 2026-06-04
- **Communication:** PT-BR (chat) · EN (this document)

---

## 1. Scope & method

Epic 1 is foundational and there is **no clean isolated diff**: baselines are mixed
(1.1/1.2 → `0c24cef`, 1.3 → `dabf4c7`, 1.4–1.8 had none) and later epics edited the same
foundational files. A commit-range diff would be noisy and misleading. The review was therefore
conducted as a **current-state audit of Epic 1-owned files against each story's acceptance
criteria**, separating:

- **Epic 1 mechanism** (reviewed): root configs, `turbo.json`, `tooling/*`,
  `packages/{config,db,ui,observability}` foundation, app shells + `/health`, `.github/workflows/ci.yml`.
- **Later-epic extensions** (NOT counted as Epic 1 defects): the full `packages/db/src/schema`
  tables (epics 2/5/6+), extra `@leedi/config` env vars (epic 2+), the many routers mounted in
  `apps/api/src/app.ts`.

Each story commit is dedicated and verifiable:

| Story | Commit | Story | Commit |
|-------|--------|-------|--------|
| 1.1 | `0c24cef` | 1.5 | `ec0dd67` |
| 1.2 | `dabf4c7` | 1.6 | `11761d6` |
| 1.3 | `8db00bb` | 1.7 | `53189b9` |
| 1.4 | `d9f5685` | 1.8 | `4de46cb` |

---

## 2. Verdict: 🟢 Foundation is sound; Epic 1 test suites green (one repair needed)

All acceptance criteria are **functionally met**, and the Epic 1 test suites were **actually executed**
(not just confirmed to exist):

| Package | Result |
|---------|--------|
| `@leedi/ui` | ✅ 28/28 |
| `@leedi/observability` | ✅ 3/3 |
| `@leedi/config` | ⚠️→✅ 5/5 **after repairing a stale test fixture this session** (Finding 7) |
| `@leedi/db` | ✅ Epic 1 `exports.test.ts` passes; 3 later-epic RLS suites fail (env/live-DB, out of scope — §4) |

Code-level spot checks confirmed the story completion claims against the actual implementation:

| Claim | Verified against code |
|-------|----------------------|
| ESLint cross-domain ban (1.2 AC#2) | ✅ `no-restricted-imports` `@leedi/*/src/**` in `tooling/eslint-config/index.js` |
| Env frozen + fail-fast (1.3 AC) | ✅ `Object.freeze` in `validate.ts`; `process.exit(1)` at import in `index.ts` |
| `no-process-env` ban (1.3 AC#3) | ✅ `no-restricted-properties` repo-wide + `packages/config` override |
| Migrations separate `max:1` conn (1.4 pitfall) | ✅ `packages/db/src/migrate.ts` |
| Runtime client `prepare:false` (1.4 pitfall) | ✅ `packages/db/src/client.ts` |
| `/health` exact body + testable `app` (1.6 AC#2) | ✅ `apps/api/src/{app.ts,routes/health.ts}` + health test |
| Config imported before routes (1.6) | ✅ first line of `apps/api/src/app.ts` |
| CI 5 jobs chained via `needs` (1.8 AC) | ✅ install→lint→typecheck→build→migrate-check |
| Test suites present | ✅ config, db, ui, observability, api/health |

The issues found are **documentation hygiene and security**, not functionality.

---

## 3. Findings

| # | Sev | Finding | Story | Status |
|---|-----|---------|-------|--------|
| 1 | 🔴 High | Real secrets committed in tracked files | 1.7 | **Partially fixed** — files scrubbed; **rotation pending (Caio)** |
| 2 | 🟠 Med | Malformed git-tracked filename (Windows path as filename) | — | ✅ Fixed |
| 3 | 🟠 Med | Empty/incomplete Dev Agent Records block `review → done` | 1.3/1.4/1.5/1.6/1.7 | ✅ Fixed |
| 4 | 🟡 Low | ESLint cross-domain guard missed relative traversal | 1.2 | ✅ Fixed |
| 5 | 🟡 Low | Missing `baseline_commit` frontmatter (1.4–1.8) | 1.4-1.8 | ✅ Fixed |
| 6 | 🟢 Info | CI re-runs `pnpm install` in every job (redundant) | 1.8 | Documented (not changed) |
| 7 | 🟠 Med | `@leedi/config` test fixture stale → suite was RED (3/5) | 1.3 | ✅ Fixed |

### Finding 1 — Real secrets in version control 🔴

- `.env.example` (tracked) carried **4 real Sentry DSNs** for web/dashboard/admin/api (lines 11–14).
- Story `1-7-…md` Completion Notes carried a real **Sentry API DSN** and a real **Better Stack
  source token** (`FQL6oTpoN55…`).

Sentry DSNs allow event injection/quota abuse; the Better Stack source token allows log injection.
Both are already in git history — **scrubbing the files does not undo the exposure**.

**Fixed this session:** real values replaced with placeholders in `.env.example`; story 1.7 notes
redacted with a security warning.

**Still required (Caio — needs console access):**
1. **Rotate** the Better Stack source token (Better Stack → Sources → regenerate).
2. **Rotate** the Sentry DSNs / consider new keys (Sentry → Project Settings → Client Keys).
3. Decide whether to **purge git history** (`git filter-repo` / BFG) — recommended only if the repo
   will be public or shared; otherwise rotation is the pragmatic mitigation. The repo is already
   public per story 1.8 notes, so **history purge + rotation is the safe path**.

### Finding 2 — Malformed tracked file 🟠

A file named `C:UsersexponprojetosleediEPIC_9_COMPLETION_PLAN.md` (a Windows absolute path
collapsed into a filename; the `:` stored as Unicode `U+F03A`) was tracked at repo root — an Epic 9
planning checklist superseded by stories 9.1–9.4.

**Fixed this session:** content relocated to
`_bmad-output/planning-artifacts/epic-9-completion-plan.md`; malformed file `git rm`'d.

### Finding 3 — Documentation integrity blocks `review → done` 🟠

Per the team's sprint workflow, a story cannot move `review → done` with an empty Dev Agent Record.

- **1.3, 1.5, 1.6:** Completion Notes List **and** File List were entirely empty.
- **1.4:** File List listed only `_journal.json` (omitted client/migrate/config/tests).
- **1.7:** File List omitted the entire `packages/observability` package it created.
- **1.2–1.8:** task checkboxes left unchecked.

**Fixed this session:** Completion Notes + File Lists reconstructed from each story's commit
(clearly marked as reconstructed in code review); task checkboxes flipped to reflect completed work.

### Finding 4 — ESLint cross-domain guard incomplete 🟡

Story 1.2 explicitly required blocking **both** forms of internal import. The config only banned the
bare specifier `@leedi/*/src/**`; relative traversal (`../../agent/src/use-cases/...`) was **not**
caught — the exact pitfall the story called out.

**Fixed this session:** added a second `no-restricted-imports` pattern with
`regex: '^\\.\\./.*/src/'`. Verified zero existing violations (no current code uses relative
cross-package imports) and that Epic 1 packages still lint clean (exit 0).

### Finding 5 — Missing baseline frontmatter 🟡

Stories 1.4–1.8 lacked `baseline_commit`, breaking diff-baseline traceability for future reviews.

**Fixed this session:** added `baseline_commit` to each = the previous story's commit
(the real, verifiable baseline), matching the 1.2/1.3 convention.

### Finding 6 — Redundant CI installs 🟢 (documented, not changed)

`ci.yml` runs `pnpm install --frozen-lockfile` in **every** job (install, lint, typecheck, build,
migrate-check). Because each job is a fresh runner, the standalone `install` job's work is not reused
downstream — it only warms the pnpm store cache. The pipeline is **correct and green**; this is pure
runtime waste.

**Not auto-applied** (restructuring a green pipeline carries regression risk). Recommended options
for a future PR:
- Collapse to a **single job** with ordered steps (shared workspace, one install), or
- Add explicit `actions/cache` restore for `node_modules`/store across jobs.

---

### Finding 7 — Stale `@leedi/config` test fixture 🟠

`packages/config/src/__tests__/validate.test.ts` was **RED (3/5 failing)**: the `validEnv` fixture
still listed only the original 6 Epic 1 vars, while the schema had grown (epics 2/4/7/11/17/18 added
~20 required vars). The positive-path tests (`expect(success).toBe(true)`) failed because `safeParse`
now rejected the incomplete fixture.

This is genuinely a story 1.3 test (it broke the Epic 1 AC "tests pass"), so it was in scope.

**Fixed this session:** `validEnv` completed with every currently-required var (valid base64
`ENCRYPTION_MASTER_KEY`, UUID `WORKSPACE_ID`, 32-char auth secret, etc.) + an in-file "keep in sync
with schema.ts" note. Suite now **5/5 green**.

> Root cause is a process gap: later epics added required env vars without updating this fixture.
> Consider adding `pnpm --filter @leedi/config test` to the CI `test` job so this can't silently rot again.

---

## 4. Out-of-scope observations (NOT Epic 1 defects)

1. **`apps/api` lint — 14 errors** in later-epic code (`routes/billing.ts`, `routes/usage.ts`,
   `inbox/actions.ts`, `use-cases/gateway/*` — epics 11/16/17): `prefer-const` and unused-vars. The
   Epic 1 lint **mechanism is working correctly** (catching real issues). Belongs to those epics' reviews.

2. **`@leedi/db` — 3 RLS test suites fail** (`rls.test.ts`, `whatsapp-connections-rls.test.ts`,
   `agent-configs-rls.test.ts` — epics 2/4/7). They `process.exit(1)` on importing `@leedi/config`
   (test env lacks the full required env set) and also need a live DB. The Epic 1 `exports.test.ts`
   passes. Belongs to those epics' reviews + a shared test-env bootstrap (see Finding 7 root cause).

---

## 5. Corrections applied this session

| File(s) | Change |
|---------|--------|
| `tooling/eslint-config/index.js` | Added relative cross-package import guard (Finding 4) |
| `.env.example` | Replaced 4 real Sentry DSNs with placeholders (Finding 1) |
| `1-7-…md` | Redacted real Sentry DSN + Better Stack token; completed File List; baseline (Findings 1,3,5) |
| `1-3-…md`, `1-5-…md`, `1-6-…md` | Reconstructed Completion Notes + File Lists (Finding 3) |
| `1-4-…md` | Completed File List; baseline (Findings 3,5) |
| `1-5/1-6/1-8-…md` | Added `baseline_commit` frontmatter (Finding 5) |
| `1-2…`→`1-8…md` | Flipped completed task checkboxes (Finding 3) |
| repo root → `planning-artifacts/` | Relocated + removed malformed file (Finding 2) |
| `packages/config/src/__tests__/validate.test.ts` | Repaired stale `validEnv` fixture → suite 5/5 green (Finding 7) |

**Verification run after corrections:** Epic 1 packages lint clean (exit 0); `@leedi/{config,ui,observability}`
tests green (5/28/3); `@leedi/db` Epic 1 `exports.test.ts` green.

## 6. Action items for Caio (not auto-applied)

- [ ] **Rotate** Better Stack source token and Sentry keys (Finding 1).
- [ ] **Decide on git-history purge** (repo is public) for the leaked secrets (Finding 1).
- [ ] Add a `test` job to `ci.yml` (at least `@leedi/config`) so fixtures can't silently rot (Finding 7 root cause).
- [ ] Optionally open a follow-up PR to de-duplicate CI installs (Finding 6).
- [ ] Triage the out-of-scope failures (§4) in their owning epics' reviews (apps/api lint; db RLS suites).
- [ ] Move stories 1.1–1.8 `review → done` once the above + this report are accepted.

---

## 7. Continuation — 2026-06-08

Resumed the review to close out Epic 1 findings and register cross-epic items.

**Resolved this session:**

- **Finding 7 root cause — CI `test` job:** confirmed a scoped `test` job was already added to `ci.yml` (runs `turbo run test --filter='!@leedi/db' --filter='!@leedi/api'`). ✅
- **Dangling pipeline reference (new Epic 1 defect):** `ci.yml` referenced `epic-1-test-ci-backlog.md`, which **did not exist** — a dead path in the pipeline file. **Created** `_bmad-output/implementation-artifacts/epic-1-test-ci-backlog.md` documenting the test-gate exclusion rationale (db RLS → live-DB + non-`BYPASSRLS` role; api → test-state pollution) and the deliberate lint-gate state. ✅

**New finding — CI `lint` gate is RED on `main` (🟠, classified as later-epic debt, not an Epic 1 defect):**

Ran the exact CI command `pnpm lint` from repo root (the lint job has **no** `--filter` exclusions). It is **RED**: 5 packages fail, ~34 problems.

| Package | Problems | Owning epic(s) |
|---------|----------|----------------|
| `@leedi/api` | 15 (unused-vars, `prefer-const`) | 11/14/15/16/17/19 |
| `@leedi/dashboard` | 15 (`setState`-in-effect, 1× `use-before-define`, 1× `process.env`, unused) | 10/12/13/14/15/18 |
| `@leedi/connection` | 1 (`no-explicit-any`) | 4 |
| `@leedi/usage` | 2 (unused) | 16 |
| `@leedi/knowledge` | 1 (unused, test) | 6 |

The Epic 1 lint **mechanism is correct** — it is catching real debt in later-epic code (consistent with §4.1). Per the user's instruction ("register cross-epic corrections in the owning epic"), each error was **registered per-epic in `deferred-work.md`** (section "Deferred from: code review of Epic 1") and **not fixed here**. Two items flagged as substantive (⚠️): a `use-before-define` in `template-builder-client.tsx` (Epic 12 — not a live bug; reorder + missing dep) and a client-side `process.env.NEXT_PUBLIC_*` in `push-registration.ts` (Epic 18 — a *legitimate* exception needing a justified `eslint-disable`, since `@leedi/config` is server-only).

**Deliberate decision (recorded in the backlog file):** the lint gate is left **unscoped** — we do not hide 5 packages of fixable debt behind exclusions (unlike the test suites, which genuinely cannot pass without infra). Trade-off surfaced for Caio: `main` CI stays red until per-epic cleanups land, so **Story 1.8 cannot honestly move `review → done`** until either the lint debt clears or the gate is explicitly scoped. Three options: (a) accept red until per-epic cleanup [current], (b) scope the lint gate now, (c) bulk-fix the ~34 trivial errors now (contradicts register-don't-fix).

**Still pending (Caio — manual, unchanged):** the committed `.env.example` at `HEAD` still carries the 4 real Sentry DSNs (working-tree scrub is **uncommitted**); LOW severity (DSNs are public-by-design). Better Stack token already rotated. Rotate Sentry keys + decide on git-history purge at Caio's discretion.
