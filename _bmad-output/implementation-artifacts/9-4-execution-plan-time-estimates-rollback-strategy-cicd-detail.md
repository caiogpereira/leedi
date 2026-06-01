---
baseline_commit: 9ea8a05
---

# Story 9.4: Execution Plan — Time Estimates, Rollback Strategy & CI/CD Detail

Status: ready-for-dev

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

- [ ] Task 1: Update section 7 — time estimates (AC: #1, #5)
  - [ ] Read current section 7 in `docs/03-leedi-execucao.md`
  - [ ] For each phase/epic, confirm estimated developer-days is present; add if missing
  - [ ] Add confidence level (high = well-understood scope; medium = moderate uncertainty; low = external dependencies or novel tech)
  - [ ] Add external dependency notes where applicable — at minimum Epic 12 (Meta approval latency)
  - [ ] Do NOT inflate estimates to look conservative — use honest calibration based on completed epics
- [ ] Task 2: Update or complete section 8 — rollback strategy (AC: #2)
  - [ ] Read current section 8; identify what is already documented vs. missing
  - [ ] Add or expand: Vercel deployment rollback (CLI: `vercel rollback`, dashboard: promote previous deployment)
  - [ ] Add: Drizzle migration rollback — for V1 migrations are additive (no destructive changes); for a bad migration, the safe procedure is: (a) apply a new "undo" migration rather than running a true down-migration, (b) document the specific Supabase SQL commands
  - [ ] Add: the "migration applied + broken code" procedure: the new code can be reverted to the previous Vercel deployment while the schema stays forward; the previous code must be compatible with the new schema (this is why all migrations must be backward-compatible with the prior code version — enforce this in the Definition of Done for each story)
- [ ] Task 3: Update section 9 — CI/CD pipeline detail (AC: #3, #4)
  - [ ] Read current section 9; confirm all stages are documented
  - [ ] Add any missing stages with the corresponding tool/command: e.g., `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm migrate:validate`, `pnpm build`, `vercel deploy --prebuilt`, smoke test (`curl /health && pnpm test:smoke`)
  - [ ] Add branch trigger matrix (PRs → CI; main → CI + CD)
  - [ ] Add staging URL pattern
  - [ ] Add smoke test definition: `/health` returns 200 + canary read (e.g., `SELECT 1` via the API's DB check endpoint)
- [ ] Task 4: Cross-check for conflicts (AC: #1–#5)
  - [ ] Confirm the time estimates in section 7 are consistent with the epic ordering in section 3 (dependency graph)
  - [ ] Confirm the rollback procedure in section 8 is consistent with the Drizzle migration strategy in Architecture

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

_not yet assigned_

### Debug Log References

_none_

### Completion Notes List

_not yet implemented_

### File List

_not yet implemented_

### Change Log

_none_
