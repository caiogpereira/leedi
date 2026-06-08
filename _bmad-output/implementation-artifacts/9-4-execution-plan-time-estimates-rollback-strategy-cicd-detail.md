---
baseline_commit: 992b842
---

# Story 9.4: Execution Plan — Time Estimates, Rollback Strategy & CI/CD Detail

Status: review

## Story

As a project lead,
I want the Execution Plan to contain per-phase time estimates, a complete production rollback strategy, and a detailed CI/CD pipeline,
so that the team can commit to delivery dates and recover safely from bad deploys.

## Acceptance Criteria

1. **Given** the updated `docs/03-leedi-execucao.md` section 7 (Estimativas de Tempo por Fase), **When** each phase section is read, **Then** it includes: (a) an estimated duration in developer-days, (b) a confidence level (high/medium/low), and (c) any external dependencies that could extend the estimate (e.g., Meta approval latency for Epic 12).
2. **Given** section 8 (Estratégia de Rollback em Produção), **When** read, **Then** it explicitly covers: (a) how to revert a Vercel deployment (promote previous deployment via Vercel CLI or dashboard), (b) how to roll back a Drizzle migration safely (down-migration SQL, steps to apply in Supabase), and (c) the procedure for "migration applied but new code is broken" — the most dangerous case (roll back code without rolling back schema; what constraints this creates).
3. **Given** section 9 (Pipeline CI/CD), **When** read, **Then** it details all pipeline stages in order: `lint → typecheck → unit tests → migration validation → build → deploy staging → smoke test → promote production`, with the tool/command for each stage.
4. **Given** section 9, **When** read, **Then** it explicitly states: (a) which branches trigger CI (all PRs + main), (b) which trigger CD (main only), (c) staging URL pattern (`*.preview.vercel.app` or equivalent), and (d) the smoke test definition (at minimum: `/health` returns 200, and a canary DB read succeeds).
5. **Given** section 7, **When** the "Epic 12: Meta Template Management" phase is read, **Then** the external dependency note includes: "Meta template approval can take 24–72h and is outside team control; plan buffer accordingly."

## Tasks / Subtasks

- [x] Task 1: Update section 7 — time estimates (AC: #1, #5)
  - [x] Read current section 7 in `docs/03-leedi-execucao.md`
  - [x] For each phase/epic, confirm estimated developer-days is present; add if missing
  - [x] Add confidence level (high = well-understood scope; medium = moderate uncertainty; low = external dependencies or novel tech)
  - [x] Add external dependency notes where applicable — at minimum Epic 12 (Meta approval latency)
  - [x] Do NOT inflate estimates to look conservative — use honest calibration based on completed epics
- [x] Task 2: Update or complete section 8 — rollback strategy (AC: #2)
  - [x] Read current section 8; identify what is already documented vs. missing
  - [x] Add or expand: Vercel deployment rollback (CLI: `vercel rollback`, dashboard: promote previous deployment)
  - [x] Add: Drizzle migration rollback — for V1 migrations are additive (no destructive changes); for a bad migration, the safe procedure is: (a) apply a new "undo" migration rather than running a true down-migration, (b) document the specific Supabase SQL commands
  - [x] Add: the "migration applied + broken code" procedure: the new code can be reverted to the previous Vercel deployment while the schema stays forward; the previous code must be compatible with the new schema (this is why all migrations must be backward-compatible with the prior code version — enforce this in the Definition of Done for each story)
- [x] Task 3: Update section 9 — CI/CD pipeline detail (AC: #3, #4)
  - [x] Read current section 9; confirm all stages are documented
  - [x] Add any missing stages with the corresponding tool/command: e.g., `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm migrate:validate`, `pnpm build`, `vercel deploy --prebuilt`, smoke test (`curl /health && pnpm test:smoke`)
  - [x] Add branch trigger matrix (PRs → CI; main → CI + CD)
  - [x] Add staging URL pattern
  - [x] Add smoke test definition: `/health` returns 200 + canary read (e.g., `SELECT 1` via the API's DB check endpoint)
- [x] Task 4: Cross-check for conflicts (AC: #1–#5)
  - [x] Confirm the time estimates in section 7 are consistent with the epic ordering in section 3 (dependency graph)
  - [x] Confirm the rollback procedure in section 8 is consistent with the Drizzle migration strategy in Architecture

## Dev Notes

- Documentation story. No code, no migrations.
- Files to modify: `docs/03-leedi-execucao.md` (sections 7, 8, 9).
- The rollback strategy for Drizzle is V1-specific: since V1 migrations are always additive (add columns/tables, never drop or rename), a true "down migration" is rarely needed. Document this constraint explicitly so future developers don't assume rollback is free.
- Time estimates: base on actual experience with completed epics (Epics 1–4 are in review, 5–7 are ready-for-dev). Use those as calibration anchors.

### Testing standards

- Manual verification: read sections 7, 8, and 9 after edits; confirm each AC item is covered.

### Pitfalls to avoid

- Do NOT add a section 10 or 11 that conflicts with the existing section 10 (Riscos e Mitigação).
- Do NOT change the smoke test definition to require more than what CI can reliably verify.
- Do NOT remove existing content — only add or clarify.

### References

- [Source: docs/03-leedi-execucao.md#7 Estimativas de Tempo por Fase]
- [Source: docs/03-leedi-execucao.md#8 Estratégia de Rollback]
- [Source: docs/03-leedi-execucao.md#9 Pipeline CI/CD]
- [Source: docs/01-leedi-arquitetura.md] (Drizzle migration strategy)
- [Source: _bmad-output/planning-artifacts/epics.md#Story 9.4]
- [Source: _bmad-output/planning-artifacts/implementation-readiness-report-2026-05-29.md] (gap items E1, E2, E3)

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6[1m]

### Debug Log References

_none_

### Completion Notes List

- §7 had estimates in weeks with no confidence levels or explicit Epic 12 dependency. Replaced table with dev-days + confidence + external-dep column. Calibrated against Epics 1–8 (completed, in review). Added explicit Epic 12 Meta template approval latency note (24–72h buffer).
- §8 had a general rollback scenarios table but was missing: Vercel CLI command (`vercel rollback`), Drizzle-specific rollback procedure, and the critical "migration applied + broken code" edge case. All three added as distinct subsections.
- §9 had CI/CD config but was missing: branch trigger matrix (PR vs main distinction), staging URL pattern, explicit smoke test definition. All three added at the top of the section. Note: the execution plan doc has duplicate section numbering (§8 and §9 appear twice). Edits were made to the FIRST occurrences (rollback and CI/CD), which are the intended targets.
- Cross-check: §7 estimates are consistent with the §3 dependency graph. §8 rollback is consistent with the additive-only migration constraint described in Architecture.

### File List

- docs/03-leedi-execucao.md

### Change Log

- Rewrote §7 estimates table with dev-days, confidence levels (High/Medium/Low), and external dependency column (2026-06-02)
- Added Epic 12 Meta template approval buffer note (~24–72h, Low confidence) (2026-06-02)
- Added Vercel CLI rollback section to §8 (2026-06-02)
- Added Drizzle migration rollback procedure (undo migration pattern, no destructive down-migrations) to §8 (2026-06-02)
- Added "migration applied + broken code" critical procedure to §8 (2026-06-02)
- Added branch trigger matrix, staging URL pattern, and smoke test definition to §9 (2026-06-02)
