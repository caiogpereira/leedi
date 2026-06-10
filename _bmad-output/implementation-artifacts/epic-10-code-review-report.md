# Epic 10 — Code Review Report

- **Epic:** 10 — Campaign Management
- **Stories reviewed:** 10.1 → 10.3 (all in `review`)
- **Reviewer:** Claude (Opus 4.8) via `bmad-code-review`
- **Date:** 2026-06-10
- **Communication:** PT-BR (chat) · EN (this document)
- **Method:** single-session adversarial implementation-vs-spec audit at the **current working
  tree**, playing all three reviewer layers inline (Blind Hunter / Edge Case Hunter / Acceptance
  Auditor). Each story's File List was opened on disk and audited against its ACs + `epics.md`.
  Runnable suites were **executed**, not merely read; every finding was **fixed and
  re-run/re-typechecked green** in this session.

> **Method note — baseline.** All three stories declare `baseline_commit: 992b842`, which predates
> the monolithic `a6b9844` "epics 7–20" checkpoint. No commit boundary isolates Epic 10 from epics
> 7–9 / 11–20 (shared files such as `process-message.ts` show as full insertions vs that baseline),
> so the audit is **file-based at HEAD**, scoped to each story's File List, not a commit diff. The
> change set is almost purely additive (1 deletion total), so no shared-file deletions were missed.

---

## 1. Verdict: 🟢 Ship-ready after 3 fixes (all applied & verified this session)

No data-loss or money-path defect, but Story 10.2 carried a genuine **AC violation** plus a wrong
HTTP-status bug, and a claimed test was missing:

| Story | Summary | Outcome |
|-------|---------|---------|
| **10.1** Campaign CRUD & phase schema | Migration `0010` (campaigns + segments): enums, RLS `ENABLE`+`FORCE`, tenant-isolation policy, **partial unique index** `campaigns(tenant_id) WHERE status='ativa'`, `set_updated_at` triggers. `createCampaign` defaults `fase:'aquecimento'`/`status:'rascunho'` (AC#2). CRUD router + `assertNoActiveCampaign` guard (AC#6). No defect; behavioral RLS test stays deferred (PL-13). | ✅ done |
| **10.2** Activation & phase transitions | Activate / transition / pause / end use cases, QStash delayed-job scheduler + signature-verified internal endpoint, reschedule-on-PATCH. **F1 (HIGH)** terminal-state reactivation + missing test, **F2 (MEDIUM)** 500-instead-of-400 on invalid transition, **F3 (LOW)** tsc error → all fixed. Task 2 `lead_journey_events` deferral is legit (§C of pre-launch checklist). | ✅ done |
| **10.3** Active campaign as agent context | `consultarOfertasAtivas` rewritten to read live campaign state; `instrucao_comercial` per `tipo`×`fase`; downsell product override; playground `campaignId` (UUID-validated). Breaking return-type change audited repo-wide — no stragglers. No code change required. | ✅ done |

---

## 2. Findings & fixes

### F1 — HIGH · `encerrada` (terminal) campaign could be reactivated (Story 10.2, AC#7)
`activateCampaign` set `status='ativa'` on the target campaign **without checking its current
status**. `endCampaign` makes `encerrada` terminal (AC#7: "the campaign cannot be reactivated —
enforce at the API layer"), but `assertNoActiveCampaign` only blocks a *second* active campaign, not
the resurrection of an ended one. So `end` → `activate` brought a dead campaign back to life.

Worse, Task 7 claimed *"Unit: end-campaign is a terminal state — subsequent activate throws"* as
done, but **the activate test only covered the conflict + happy paths** — the terminal case was
never tested.

**Fix:** `activateCampaign` now reads the target's status inside the tx and throws the new
`CampaignEndedCannotReactivateError` (409) when it is `encerrada`; the router maps it to 409; added
the missing unit test (`refuses to reactivate an encerrada campaign`, asserts no `update` runs).

### F2 — MEDIUM · Invalid phase transition returned 500 instead of 400 (Story 10.2, AC#3)
The `/campaigns/:id/transition` route mapped errors with
`err.message.includes('transição')` (lowercase t), but `InvalidPhaseTransitionError`'s message is
`"Transição de fase inválida: …"` — capital **T**. `String.includes` is case-sensitive, so the
match **never fired** and invalid transitions surfaced as a raw **500**.
`PerpetualCampaignTransitionError` matched only by accident (its message happens to contain a
lowercase "transição"). The unit tests asserted the use case throws the right error class but never
exercised the HTTP mapping, so they stayed green over a broken API contract.

**Fix:** route now maps `InvalidPhaseTransitionError` + `PerpetualCampaignTransitionError` → **400**
and `CampaignAlreadyEndedError` → **409** via `instanceof` (no string matching). Added a **route-level
test** (`campaigns-router.test.ts`) that drives the real use case → real error class → router catch
(`app.request(...)`, middleware mocked per the `usage.test.ts` pattern) and asserts 400 — closing the
exact "tests never exercise the HTTP mapping" gap this finding called out. The F1 encerrada→409
mapping is covered by the same suite.

### F3 — LOW · Pre-existing tsc error in the 10.2 job test
`campaign-phase-transition.test.ts` indexed `mockPublishJSON.mock.calls[0][0]`, which is
`possibly undefined` under `noUncheckedIndexedAccess` — the api package would not typecheck.
**Fix:** `calls[0]![0]`. Epic 10 files are now type-clean.

---

## 3. What held up (no change needed)

- **10.3 breaking change is safe.** Return type `ActiveOffer[]` → `OfertasAtivasResult` and the drop
  of `getActiveOffers` from the tool were audited repo-wide (`grep ActiveOffer|getActiveOffers`): the
  result is returned straight to the LLM by `registry.ts`, no caller treats it as an array, and
  `@leedi/knowledge` still exports `getActiveOffers` for its own consumers. No dangling reference.
- **Downsell product is single-pathed.** `transitionCampaignPhase` only mutates `fase`; the effective
  product is computed solely in the tool from live `config.downsell.produto_id`. No drifting second
  resolution path (10.1 AC#5 / 10.2 AC#3 / 10.3 AC#5 agree).
- **Enums.** pgEnum literals (pt-BR) match the Zod schemas and all `fase/status/tipo` comparisons
  exactly — no repeat of the Epic 4 Meta-vs-pgEnum class of bug.
- **Migration `0010`** registered in `_journal.json` (idx 10); partial unique index + `FORCE RLS`
  present in the emitted SQL (the Drizzle expression-index pitfall did not bite).
- **AC#4 scheduled transition** internal endpoint is QStash-signature-verified (`verifyQStash`→401);
  reschedule cancels the old `scheduledJobId` before enqueuing.
- **Playground `campaignId`** is `z.string().uuid()`-validated → avoids the non-UUID-500 class seen
  in Epic 8.

---

## 4. Deferred / out-of-scope (not fixed here)

- **10.2 Task 2 — `lead_journey_events` for phase transitions.** Legit deferral (schema requires
  `lead_id NOT NULL`; transitions are tenant-level). Already tracked as **P2** in
  `pendencias-pre-launch.md` §C — needs a nullable redesign or a `campaign_events` table.
- **10.1 behavioral cross-tenant RLS test** — deferred to a real non-BYPASSRLS env (MCP runs
  privileged). Tracked under **PL-13**.
- **Repo-wide red bars unrelated to Epic 10** (observed while running suites, *not* this epic's):
  `daily-billing-check.ts` tsc error (Epic 17); `handle-quality-update > mapQualitySignal` failing
  (Epic 13 — the latent Meta-enum bug already flagged in the Epic 4 review memory);
  `process-dispatch-batch` (Epic 13) and `handle-purchase-approved` (Epic 11) failures;
  `health.test.ts` fails on missing `VAPID_SUBJECT` (Epic 18 notification env). These belong to their
  own epic reviews.

---

## 5. Verification (executed this session, at HEAD)

| Check | Result |
|-------|--------|
| `apps/api` campaign use-cases + job + **route** tests (`src/use-cases/campaigns`, `campaign-phase-transition`, `routes/campaigns`) | **30/30 pass** (was 26; +1 terminal-state use-case test, +3 route-level error→HTTP tests) |
| `packages/agent` full suite | **120/120 pass** |
| `apps/api` typecheck — Epic 10 files | **clean** (sole remaining error is Epic 17's `daily-billing-check.ts`) |
| `packages/agent` typecheck | **clean** |
| `packages/db` typecheck — `campaign.ts` | **clean** (remaining errors are general `rls.test.ts`) |

**Files changed by this review:**
`apps/api/src/use-cases/campaigns/activate-campaign.ts`,
`apps/api/src/routes/campaigns/index.ts`,
`apps/api/src/use-cases/campaigns/__tests__/activate-campaign.test.ts`,
`apps/api/src/routes/campaigns/__tests__/campaigns-router.test.ts` (new),
`apps/api/src/jobs/__tests__/campaign-phase-transition.test.ts`.
