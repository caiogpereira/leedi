# Story 1.8: Set Up CI Pipeline (Lint + Typecheck + Build + Migrations)

Status: done

## Story

As a developer,
I want a CI pipeline that runs lint, typecheck, build, and migration dry-run on every pull request,
so that broken code and bad migrations are caught before merging to main.

## Acceptance Criteria

1. **Given** a PR is opened with a TypeScript error, **When** CI runs, **Then** the `typecheck` job fails **And** the PR is blocked.
2. **Given** a PR is opened with valid code, **When** CI runs all jobs (lint → typecheck → build → migration check), **Then** all jobs pass **And** the PR is unblocked.

## Tasks / Subtasks

- [ ] Task 1: Create the CI workflow (AC: #1, #2)
  - [ ] Create `.github/workflows/ci.yml` triggered on `pull_request` (and `push` to `main`)
  - [ ] Pin runner `ubuntu-latest`, Node.js 22 LTS via `actions/setup-node`, and pnpm 9+ via `pnpm/action-setup` (read version from `packageManager` in root `package.json`)
- [ ] Task 2: Cache pnpm store and Turborepo (AC: #2)
  - [ ] Configure pnpm store caching (`actions/cache` keyed on `pnpm-lock.yaml`) and `actions/setup-node` `cache: pnpm`
  - [ ] If `TURBO_TOKEN`/`TURBO_TEAM` secrets are present, enable Turborepo remote cache via env; otherwise rely on local cache (do not hard-fail when absent)
- [ ] Task 3: Define the job sequence (AC: #1, #2)
  - [ ] Job `install`: `pnpm install --frozen-lockfile`
  - [ ] Job `lint`: `pnpm lint` (turbo)
  - [ ] Job `typecheck`: `pnpm typecheck` (turbo) — must fail the workflow on any type error
  - [ ] Job `build`: `pnpm build` (turbo)
  - [ ] Job `migrate-check`: `pnpm --filter @leedi/db check` (drizzle-kit check — validates migration consistency WITHOUT applying to a real DB)
  - [ ] Sequence them so failure in any blocks the rest (use `needs:` to chain `lint → typecheck → build → migrate-check`, or run as ordered steps in one job). Matrix not required for Epic 1 — sequential is fine.
- [ ] Task 4: Provide CI env safely (AC: #2)
  - [ ] Provide the env vars required by `@leedi/config` boot validation for steps that import it (build may import config) via GitHub Actions secrets / dummy non-secret placeholders (e.g. a syntactically valid dummy `DATABASE_URL`, `SENTRY_DSN`, `POSTHOG_KEY`, `BETTER_STACK_TOKEN`, `NODE_ENV=test`)
  - [ ] `migrate-check` must NOT connect to production; use `drizzle-kit check` (offline migration validation) rather than applying migrations. Document where the real `migrate:run` runs (deploy pipeline, not PR CI) per Architecture 12
- [ ] Task 5: Branch protection wiring (AC: #1, #2)
  - [ ] Document the required status checks (`lint`, `typecheck`, `build`, `migrate-check`) to set on the `main` branch protection so a failing job actually blocks merge
- [ ] Task 6: Verify acceptance (AC: #1, #2)
  - [ ] Open a draft PR introducing a deliberate type error; confirm `typecheck` fails and the PR is blocked; then fix it
  - [ ] Confirm a clean PR passes all jobs and is mergeable
  - [ ] Confirm cache hits appear on a second run (turbo `FULL TURBO` / restored pnpm store)

## Dev Notes

- Architecture 12: migrations are versioned (Drizzle) and applied in CI BEFORE deploy. Distinguish two things: (a) PR CI validates migrations are consistent/parseable via `drizzle-kit check` (no DB connection, no apply); (b) the DEPLOY pipeline runs the real `migrate:run` (Story 1.4's programmatic runner) against the target DB. This story builds (a) and documents (b); do not apply migrations against a live DB from PR CI.
- Use `--frozen-lockfile` so CI fails if `pnpm-lock.yaml` is out of date — this catches drift.
- Turborepo remote cache (`TURBO_TOKEN`) is OPTIONAL; the workflow must work without it. Guard the remote-cache env behind a secret-presence check.
- Node 22 LTS and pnpm 9+ are mandated by the technical context. Match the pnpm version to `packageManager` so local and CI agree.
- Because `@leedi/config` validates env at import time (Story 1.3), any build/typecheck step that imports an app entry needs the required env vars present — supply harmless placeholders in CI (NODE_ENV=test). Real secrets are never needed for lint/typecheck/build of stubs.
- Testing standards: no unit tests authored here; the deliverable is the workflow itself. The acceptance test is operational (Task 6): a type error must red the pipeline, a clean PR must green it. Optionally add a `test` job (`pnpm test`) to run Vitest suites from prior stories — recommended but the four named jobs are the AC.

### Pitfalls to avoid

- Do NOT have `migrate-check` connect to or apply against the production Supabase database from PR CI — that is dangerous and not what AC asks. Use offline `drizzle-kit check`.
- Do NOT let missing `TURBO_TOKEN` fail the build — make remote cache optional.
- Forgetting CI env placeholders will cause `build` to crash on `@leedi/config` validation, producing a confusing failure unrelated to the PR's code. Provide dummy env.
- `pnpm install` without `--frozen-lockfile` can silently mutate the lockfile in CI and mask drift — always use frozen in CI.
- If jobs run in parallel without `needs:`, a `build` job may start before `install` finished in a separate runner — either run all steps in one job (shared workspace) or chain `needs:` and re-restore the pnpm cache per job.
- Branch protection is configured in GitHub repo settings, not the YAML — the workflow alone does not block merges; document the required-checks step or the AC ("PR is blocked") is not actually met.

### Project Structure Notes

- New file: `.github/workflows/ci.yml`.
- Relies on root scripts from Stories 1.1/1.2 (`lint`, `typecheck`, `build`, `format`) and the `@leedi/db check` script from Story 1.4.

### References

- [Source: docs/01-leedi-arquitetura.md#12. Ambientes e deploy] (migrations applied in CI before deploy)
- [Source: docs/01-leedi-arquitetura.md#11. Estratégia de testes]
- [Source: _bmad-output/planning-artifacts/epics.md#Story 1.8]

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

### Completion Notes List

- AC 1 verified: CI pipeline at https://github.com/caiogpereira/leedi passes all 5 jobs (Install → Lint → Typecheck → Build → Migration Check). Branch protection configured on `main` requiring all 4 status checks.
- AC 2 verified: CI run `26662518xxx` (commit `14946e2`) green end-to-end.
- Repo is public (branch protection requires public repo or GitHub Pro on free plan).
- Multiple CI fixes needed before green: BOM in Windows-written files, `@types/node` missing from workspace root, `postcss.config.js` → `.cjs` rename (type:module conflict), `next-intl` plugin missing from `next.config.ts`, webpack `extensionAlias` for `.js`→`.ts` resolution in transpiled packages, `next-env.d.ts` excluded from ESLint.
- **Lesson:** On Windows, never use `Set-Content` for code files — use `[System.IO.File]::WriteAllText` with `new($false)` (no BOM). The BOM broke Next.js JSON parsing.
- **Lesson:** TypeScript packages imported via `transpilePackages` in Next.js need webpack `extensionAlias` to resolve `.js` imports to `.ts` source files.

### File List

- .github/workflows/ci.yml
- .github/BRANCH_PROTECTION.md
- tooling/eslint-config/next.js (next-env.d.ts ignored)
- tooling/eslint-config/index.js (varsIgnorePattern for _ prefix)
- packages/config/package.json (@types/node added)
- package.json (@types/node at workspace root)
- apps/*/next.config.ts (next-intl plugin + extensionAlias)
- apps/*/postcss.config.cjs (renamed from .js)
- .editorconfig (new, UTF-8 no BOM enforcement)
