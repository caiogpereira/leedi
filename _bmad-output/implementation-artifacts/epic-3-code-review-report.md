# Epic 3 — Code Review Report

- **Epic:** 3 — Design System & UI Shell
- **Stories reviewed:** 3.1 → 3.4 (all in `review`)
- **Reviewer:** Claude (Opus 4.8) via `bmad-code-review`
- **Date:** 2026-06-09
- **Communication:** PT-BR (chat) · EN (this document)
- **Method:** single-session, implementation-vs-spec audit at **current HEAD**. The
  `baseline_commit` recorded in every Epic 3 story (`992b8421…`) was **invalidated by the
  git-history secret purge** (commit `460a15c`) — it no longer resolves (`git cat-file` →
  *bad object*), so a commit-diff review was impossible. Instead each story's claimed
  implementation (File List, Completion Notes, task checkboxes) was audited against the
  files actually on disk and against `epics.md` (the source spec). All runnable test
  suites were **executed**, not merely read.

---

## 1. Scope & method

Epic 3 has no isolated per-story commits available (history was rewritten), so the audit is
**spec → claim → code → test**, story by story:

1. Read each story's ACs + Tasks + Dev Notes + Completion Notes + File List.
2. Open every file the story claims to have created/modified; confirm it exists and matches the claim.
3. Cross-check the AC against `epics.md#Epic 3` (UX-DR1–UX-DR9, NFR11–NFR15).
4. **Run** the test suites the stories claim pass.

**Test execution (this session, at HEAD):**

| Suite | Result |
|-------|--------|
| `@leedi/ui` (`vitest run`) | **28 passed** (4 files: contrast, FormField, AIAssistedTextarea, Label) |
| `@leedi/dashboard` (`vitest run`) | **65 passed** (10 files, incl. `Sidebar.test`) |
| `@leedi/admin` (`vitest run`) | **18 passed** (4 files, incl. `AdminSidebar.test` + auth-guard) |
| `@leedi/api` AI route (`ai-improve-text.test.ts`) | **4 passed** (asserts Haiku id + stream + error) |

All unit/component claims are **verified green**. What is **not** verified — and is the spine of
this report — is everything the stories attribute to **Playwright/axe E2E**, because that test
harness **does not exist in the project** (§2).

**Typecheck (CI's real gate), run this session:** the Epic-3 surface is **clean**.

| Package | Epic-3 files | Notes |
|---------|--------------|-------|
| `@leedi/ui` | ✅ clean | full `tsc --noEmit` passes |
| `@leedi/admin` | ✅ clean | full `tsc --noEmit` passes |
| `@leedi/dashboard` | ✅ clean | the only errors are **later-epic** debt (Epic 6 `ArgumentList`/`@/` alias, Epic 12 `templates/new` `libraryId`, Epic 18 `push-registration`) — none in shell/`AIAssistedTextarea` files |
| `@leedi/api` | ✅ clean | the only errors are **later-epic** debt (Epic 6 knowledge, Epic 10 campaign job, Epic 16/17 billing, Epic 18 `@leedi/notification` missing) — none in `routes/ai.ts` or `ai/*` |

(The later-epic typecheck debt is already registered in `deferred-work.md` / the Epic 2 report; `@leedi/db`'s
`rls.test.ts` typecheck errors are Epic-2 RLS-test debt — neither is an Epic-3 defect.)

**Token-discipline sweep (UX-DR1/DR4), run this session — the stories' "enforce in code review" items:**

- **Hardcoded hex in component code:** **0** across `packages/ui/src`, `apps/dashboard`, `apps/admin`
  (`.tsx`). The only hex literals are in `packages/ui/src/__tests__/contrast.test.ts`, which *intentionally*
  asserts token values. ✅
- **`accent-ai` leakage:** in source, `accent-ai` appears **only** in `AIAssistedTextarea.tsx` (AI context)
  and `contrast.test.ts`. No shell/admin chrome uses it. ✅ (one hit was a `.next/` build artifact — ignored)
- **Pure black:** no `#000`/`#000000` and no pure-black surface base. `bg-black/40–80` appears only as
  **semi-transparent modal/drawer overlay scrims** (Radix Dialog overlay, mobile-drawer backdrops) — the
  standard shadcn pattern, **not** the dark base (which is `#0A0A0F`/`--color-neutral-950`). Not a violation. ✅

---

## 2. Verdict: 🟡 Component/unit layer is solid and green — but the entire Epic-3 **E2E layer is a non-executable stub**, and several task checkboxes overclaim it as done

The good, verified at HEAD:

- **3.1** Shell composes `(shell)/layout.tsx` → `Sidebar` + `Header` + `<main id="main-content">`;
  `next-themes` provider with `storageKey="leedi-theme"`, `suppressHydrationWarning`, `mounted`-guarded
  toggle; nav driven by a typed array + next-intl; `aria-current="page"`; skip-link present. ✅
- **3.2** Admin shell guard runs in the **layout** (`getWorkspaceAdminRole(...) !== 'super_admin'` →
  `redirect('/login')`), reads from `workspace_admins` (RBAC §5.3); `adminNav.*` = 5 keys; AdminHeader has
  **no tenant switcher**, an indigo token accent + **textual "ADMIN" badge + shield** (not color-alone). ✅
- **3.3** `AIAssistedTextarea` in `@leedi/ui` (exported via `index.ts`, **actually consumed** by
  `agente/configuracoes` and `onboarding/step-4`); Radix `Dialog`; `accent-ai` violet via
  `--accent-ai` token (no hex); `aria-live="polite"`; streaming through the **AI Provider port**
  (Anthropic SDK isolated in `claude-provider.ts`); Haiku enforced. ✅
- **3.4** `focus-visible:ring-2 ring-ring ring-offset-2` on primitives; `Label` + `FormField`
  (auto-injects `id`/`aria-describedby`/`aria-invalid`) + `LiveRegion`; **real** `wcag-contrast`
  suite (15 assertions, both themes) that **found and fixed real bugs** (`--destructive` 3.76→5.8:1
  light, 4.09→5.8:1 dark; dark base confirmed `#0a0a0f`, not `#000`). ✅

What is wrong (details in §3):

1. 🟠 **No Playwright/axe E2E harness exists** — `@playwright/test` is in **no** `package.json`,
   there is **no** `playwright.config.*`, **no** `test:e2e` script, **no** `node_modules/.bin/playwright`,
   and `@axe-core/playwright` is **not installed**. Every `apps/*/e2e/*.spec.ts` is a stub that cannot run.
   (The disconnected **Playwright MCP** is a browser-automation tool for the reviewer — unrelated; reconnecting
   it would not make these specs runnable.)
2. 🟠 **Status-integrity:** task checkboxes in 3.1/3.2/3.4 mark Playwright/axe work `[x]`. 3.4 **Task 6** in
   particular claims "*add `@axe-core/playwright`; run axe; fail CI on serious/critical violations*" — none of
   which exists. The Completion Notes are partly honest ("*add when playwright config is added*"), but the
   checkbox says done.
3. 🟢 **Doc drift** (non-blocking): nav grew to **11 items** (Playground, added by Epic 8) vs the AC's listed
   10; 3.3's File List describes a hardcoded model id while the code resolves it via `modelIdForTask` (Epic 7.8);
   a dashboard same-origin proxy route exists but is unlisted.
4. 🔵 **[Decision] resolved by Caio (2026-06-09):** keep the PT method name `completarStream` for codebase
   consistency.

---

## 3. Findings (current HEAD status)

Legend — **Status**: `VERIFIED` (claim re-run/confirmed green) · `OPEN` · `DEFER` (Epic-3 debt; needs
the E2E harness) · `DECISION` (Caio) · `DOC` (record drift, non-blocking).

| # | Sev | Story | Finding | Status |
|---|-----|-------|---------|--------|
| 1 | 🟠 | 3.1/3.2/3.4 | **No project E2E harness.** `@playwright/test` not a declared dep anywhere; no `playwright.config.*`; no `test:e2e` script; no `node_modules/.bin/playwright`; `@axe-core/playwright` absent. All `e2e/*.spec.ts` are non-executable stubs. | **DEFER** (Epic-3 debt; `deferred-work.md`) |
| 2 | 🟠 | 3.4 | **Task 6 overclaimed.** `[x]` "add `@axe-core/playwright`; run axe; fail CI on violations" — not installed, not in `ci.yml`. The CI a11y gate the story asserts **does not exist**. | **OPEN** → checkbox corrected; work deferred (#1) |
| 3 | 🟢 | 3.1 | Task 6 Playwright sub-bullets `[x]` (FOUC, theme-persist, mobile-drawer) — spec exists, **cannot run** (no harness). Vitest component test (active-route highlight) **is** real & green. | **OPEN** → Playwright bullets corrected; deferred (#1) |
| 4 | 🟢 | 3.2 | Task 6 Playwright E2E bullet `[x]` — `admin-shell.spec.ts` stub, cannot run. Unit auth-guard test **is** real & green (admin 18/18). | **OPEN** → corrected; deferred (#1) |
| 5 | 🟢 | 3.4 | Task 7 Playwright keyboard walkthrough `[x]` — cannot run (no harness). | **OPEN** → corrected; deferred (#1) |
| 6 | 🔵 | 3.3 | **Model-id record is stale.** File List / Completion Notes say the route hardcodes `claude-haiku-4-5-20251001`; the code resolves `modelIdForTask('text_improvement')` from `@leedi/agent` (Epic 7.8 centralization), which **does** resolve to that id (verified by `model-routing.test` + the AI route test). Code is **better** than the doc; doc is stale. | **DOC** (annotated in story) |
| 7 | 🔵 | 3.3 | `completarStream` (PT) on the `AIProvider` port. Conflicts with the "código sempre em inglês" preference, but matches existing domain PT identifiers (`adicionarTag`, `buscarHistoricoLead`, `enviarLinkCheckout`, `transferirHumano`). | **DECISION → KEEP** (Caio, 2026-06-09) |
| 8 | 🔵 | 3.3 | Dashboard **same-origin proxy** `app/api/ai/improve-text/route.ts` exists (forwards to `apps/api`) but is **not in the story's File List**. Legitimate (browser → same-origin → API); record drift only. | **DOC** |
| 9 | 🟢 | 3.3 | The AI route test is real (4/4) but lives in `@leedi/api`, which **CI excludes** (`turbo run test --filter='!@leedi/api'`). So it **never gates**. This is pre-existing **Epic-1** CI debt (`epic-1-test-ci-backlog.md`), not an Epic-3 defect. | **DEFER → Epic-1** (reference, not re-filed) |
| 10 | 🔵 | 3.1 | Sidebar renders **11** nav items (adds `/agente/playground`, Epic 8) — AC#1 + Completion Notes say **10**. Stale a11y stub even asserts `count === 10` (would now be 11). Acceptable epic evolution. | **DOC** |
| 11 | 🔵 | 3.4 | Task 1 text says `focus-visible:ring-primary`; primitives use `focus-visible:ring-ring` (the `--ring` token). Token-based (no hex) → meets intent; wording drift only. | **DOC** |
| 12 | 🟢 | all | `baseline_commit: 992b8421…` in all 4 stories is a **dangling object** (purge `460a15c`); diff-review impossible. Not fabricating a replacement. | **OPEN** (documented; see §5) |

No **functional** (runtime) defects were found in the component/route code itself. The Epic-3 problem is
**verification honesty**: the E2E acceptance mechanism the stories lean on was never built.

---

## 4. Per-story status conclusion (`review → done` gating)

This is a BMAD review that gates the `review → done` transition. Verdicts:

- **3.1 — Dashboard Shell → ✅ can move `review → done`** (E2E deferred). All ACs hold at the
  component layer: AC#1 sidebar + active highlight (Sidebar.test green), AC#2 theme toggle + `leedi-theme`
  persistence (code + provider), AC#3 FOUC prevention (`suppressHydrationWarning` + `defaultTheme="system"`),
  AC#4 responsive drawer (Sheet + translate). The FOUC/persist/mobile **E2E** assertions are deferred (#1/#3),
  non-blocking — the underlying mechanisms are present and unit-covered.

- **3.2 — Admin Shell → ✅ can move `review → done`** (E2E deferred). AC#1 (5-item adminNav + active),
  AC#2 (no switcher + ADMIN badge), AC#3 (layout-level `super_admin` guard) all hold at code + unit level
  (admin 18/18 incl. the redirect test). Only the E2E sweep is deferred (#4).

- **3.3 — AIAssistedTextarea → ✅ can move `review → done`.** AC#1–#5 covered by the `@leedi/ui` component
  suite + the AI route test (Haiku id, streaming, accept/edit/Escape, error+retry). Caveat: the AI route test
  does not gate in CI (#9, Epic-1 debt). Doc drift (#6/#8) annotated.

- **3.4 — Accessibility Foundations → 🟠 BLOCKED from `done` as written; recommend re-scope.**
  This is the sharp case. AC#2 (contrast) is **fully verified** by the real `wcag-contrast` suite (the story's
  strongest deliverable). AC#1 (keyboard reachability + focus ring) and AC#3 (every input labelled; errors via
  `aria-describedby`) are met at the **primitive** level (focus-visible rings + `FormField`/`Label`, unit-tested)
  **but** the story's own acceptance instrument for them — **Task 6 axe-in-CI** and **Task 7 keyboard
  walkthrough** — does **not exist**. "Automated a11y in CI" is a stated deliverable of this story, not a nice-to-have.
  **Recommendation:** either (a) build the E2E/axe harness (then 3.4 → done), or (b) **re-scope 3.4** to
  "primitives + contrast unit gate" and move axe-in-CI to the deferred E2E-infra item — then 3.4 → done with the
  axe gate explicitly carried as Epic-3 debt. Do **not** silently mark 3.4 done with Task 6 unfulfilled.

This report does **not** flip `sprint-status.yaml`. Awaiting Caio's call on 3.4 (a) vs (b); 3.1/3.2/3.3 are
clear to advance.

---

## 5. Corrections applied this session

### Story files (verification honesty)

| File(s) | Change |
|---------|--------|
| `3-1-…md` | Task 6 Playwright sub-bullets `[x]`→`[ ]` with a deferred note (kept the real Vitest bullet `[x]`); appended **Code Review Follow-up (2026-06-09)**. |
| `3-2-…md` | Task 6 Playwright E2E bullet `[x]`→`[ ]` + note (kept the real unit-test bullet); appended follow-up. |
| `3-3-…md` | Task 6 Playwright E2E bullet `[x]`→`[ ]` + note; appended follow-up (model-id-via-`modelIdForTask`, proxy route, `completarStream` decision, CI-exclusion caveat). |
| `3-4-…md` | Task 6 (axe/CI) + Task 7 (Playwright keyboard) `[x]`→`[ ]` with honest notes; appended follow-up with the **blocked/re-scope** verdict. |

### Cross-cutting

| File(s) | Change |
|---------|--------|
| `deferred-work.md` | New **"Deferred from: code review of Epic 3 (2026-06-09)"** section — E2E/axe harness (Epic-3 debt, with the exact missing pieces), the `baseline_commit` invalidation, and a pointer to the Epic-1 `@leedi/api` CI exclusion for 3.3's AI test. |

### Decisions registered (Caio, 2026-06-09)

- **#7 `completarStream`** — **KEEP** (PT, consistent with agent-domain identifiers). Convention going
  forward: PT identifiers acceptable in agent/domain code; English elsewhere (infra/contracts) — revisit only if
  a project-wide rename is undertaken.
- **#1/#2 E2E harness** — **defer infra, correct the docs now** (chosen). Real validation needs running dev
  servers + authenticated sessions, out of scope for a doc/review pass.

### Not changed (deliberately)

- **No code was modified.** Component/route code is green and correct; the only code-adjacent finding (#7) was
  decided "keep". Renaming working, tested code during a review = scope creep + regression risk.
- **`baseline_commit`** left as-is (not fabricating a hash); documented in `deferred-work.md`.
- **`sprint-status.yaml`** not flipped (awaiting the 3.4 re-scope decision).

---

## 6. Downstream-dependent corrections (per the request)

The request asked to file any fix that depends on a **later epic** in that epic's artifact. After audit, there
are **no true later-epic dependencies** in Epic 3 — the open items are either **Epic-3-local debt** (the E2E/axe
harness, which *could* be built now and is logged in `deferred-work.md`, not a later epic) or **pre-existing
Epic-1 debt** (the `@leedi/api` CI exclusion, already in `epic-1-test-ci-backlog.md` — referenced, not re-filed).
The Playground nav item (#10) and the `modelIdForTask` model routing (#6) are **already-landed** later-epic
evolutions (Epics 8 and 7.8) that simply post-date the story records — annotated as doc drift, no fix owed.

---

## 7. What still blocks closure

- **3.1, 3.2, 3.3:** nothing blocking — clear to `review → done` (E2E deferred as Epic-3 debt).
- **3.4:** blocked pending Caio's **(a) build harness / (b) re-scope** decision.
- **Epic-3 overall** cannot be declared `done` until 3.4 is resolved and the E2E-harness debt is either built or
  formally accepted as deferred (mirrors the Epic-1/Epic-2 deferred-infra precedent).

---

## 8. Update — E2E harness BUILT (2026-06-09, same session)

Caio chose **Option A (build the harness)**. Status: **Phase 1 complete & verified; Phase 2 authorized, in progress.**

**Phase 1 — DONE, runs today, gates (8/8 green):**
- Installed `@playwright/test` + `@axe-core/playwright` (devDeps in `apps/dashboard` + `apps/admin`); Chromium
  installed to **`D:\ms-playwright`** via the user env var `PLAYWRIGHT_BROWSERS_PATH` (C: was disk-constrained).
- `playwright.config.ts` for both apps with self-booting `webServer` (readiness probes `/api/health` on 3001,
  `/403` on 3002); `test:e2e` scripts added.
- Real, executing tests (no auth needed, so they gate immediately):
  - `apps/dashboard/e2e/public/guard.spec.ts` — **5/5**: anonymous `/`, `/leads`, `/agente`, `/settings/team`
    → 307 redirect to `/login` (proves the Edge auth guard); `/api/health` reachable.
  - `apps/admin/e2e/public/guard.spec.ts` — **3/3**: anonymous `/`, `/tenants` → redirect to `/login` (proves
    the `(shell)` server guard); **axe sweep on `/403` with zero serious/critical violations** (the a11y gate).
- Fixes made en route: added the missing `apps/dashboard/app/api/health/route.ts` (middleware already listed it
  public); pinned `outputFileTracingRoot` in both `next.config.ts` (a stray `~/pnpm-lock.yaml` was making Next
  infer the whole home dir as workspace root → slow dev compile).

**Environment blocker resolved this session:** C: had **0.29 GB** free → Next dev `ENOSPC` during compile.
Reclaimed space (deleted `.next`/orphaned build caches, `pnpm store prune`, killed a runaway compile) → **13+ GB**
free; browsers live on D:. **Durable caveat:** C: is chronically tight — keep an eye on it; the project may want to
relocate the pnpm store / dev caches to D: (376 GB free).

**Phase 2 — authorized (Caio, 2026-06-09), NOT yet built:** authenticated coverage (the bulk of the 3.1/3.2/3.4
ACs) against the **current Supabase**, strictly namespaced: `[E2E]` workspace/tenant, users `e2e+*@leedi.test`,
with a **scoped** cleanup that deletes ONLY that namespace (never a global wipe). Caio confirmed migrating E2E to a
separate Supabase project before the first real customer. Plan: a `global-setup` seed (Drizzle inserts +
`auth.api.signUpEmail` → set `email_verified=true` → `auth.api.signInEmail({asResponse:true})` to capture the
session cookie into `storageState`), then real authed specs — dashboard shell (11 nav items + active highlight),
keyboard/focus-ring sweep, axe on internal pages, and the AIAssistedTextarea stream→accept flow; plus a nightly
(non-blocking) CI job. Until Phase 2 lands, the authed-coverage task boxes in 3.1/3.2/3.4 stay `[ ]` (honest).
