# Epic 1 — CI gate backlog (test exclusions + lint state)

Referenced from `.github/workflows/ci.yml`. This file documents **why** the CI
quality gates are scoped the way they are, so the scoping reads as deliberate —
not forgotten. It is the *gate rationale*; the itemized, per-epic code fixes live
in `deferred-work.md`.

- **Owner:** Epic 1 / Story 1.8 (CI pipeline)
- **Last reviewed:** 2026-06-08 (Epic 1 code review continuation)

---

## 1. `test` job — intentionally scoped (excludes `@leedi/db`, `@leedi/api`)

The test gate runs `turbo run test --filter='!@leedi/db' --filter='!@leedi/api'`.
Both exclusions are because the suites **cannot pass in CI yet** — not because the
code is wrong:

| Package | Why excluded | Resolves in |
|---------|--------------|-------------|
| `@leedi/db` | 2 RLS suites (`rls.test.ts`, `whatsapp-connections-rls.test.ts`, `agent-configs-rls.test.ts`) need a **live DB** and a non-`BYPASSRLS` `leedi_app` role; they also `process.exit(1)` when `@leedi/config` boot-validation runs without the full env set. Needs a shared test-env bootstrap + ephemeral Postgres service in CI. | Epic 2 infra (RLS owners: epics 2/4/7) |
| `@leedi/api` | Cross-file **test-state pollution**: suites pass in isolation but fail when run together (shared module-level singletons / mock bleed). Needs per-suite isolation (`vi.resetModules` / lazy-init audit). | Owning api epics (11/14/16/17/19) |

**Re-include each package** in the test filter once its item above is resolved.

> Root cause of the silent rot risk (see Epic 1 review Finding 7): later epics add
> required env vars to `packages/config/src/schema.ts` without updating the CI `env:`
> block or `validate.test.ts` fixture. Keep all three in sync on every epic that adds a var.

## 2. `lint` job — intentionally UNSCOPED and currently RED on `main`

The lint gate has **no `--filter` exclusions** — by design. As of 2026-06-08,
`pnpm lint` is **RED** on `main`: 5 packages fail (`@leedi/api`, `@leedi/dashboard`,
`@leedi/connection`, `@leedi/knowledge`, `@leedi/usage`), ~34 problems total.

This is **not an Epic 1 defect.** The Epic 1 lint *mechanism* is correct and is doing
its job — catching real debt in **later-epic code** (unused vars in tests,
`prefer-const`, one `no-explicit-any`, one client-side `process.env` exception, one
`use-before-define`). The errors are itemized per owning epic in `deferred-work.md`
(section "Deferred from: code review of Epic 1").

**Decision (deliberate):** unlike the test suites — which genuinely *cannot* pass yet
(infra/live-DB/pollution) — the lint errors are trivially fixable by their owning
epics. We do **not** hide them behind a filter exclusion, because that would mask
fixable debt (and one possible bug) and weaken the gate across 5 packages. The gate
re-greens incrementally as each epic's review cleans its own files.

**Consequence to accept or override (Caio's call):** while the gate stays unscoped,
`main` CI stays red until the per-epic cleanups land, and Story 1.8's AC ("CI passes")
is not literally satisfied. Story 1.8 should therefore stay in `review` (not `done`)
until either (a) the per-epic lint debt is cleared, or (b) the gate is explicitly scoped.
