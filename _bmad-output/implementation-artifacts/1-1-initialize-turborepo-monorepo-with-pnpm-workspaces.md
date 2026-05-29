---
baseline_commit: 0c24cef
---

# Story 1.1: Initialize Turborepo Monorepo with pnpm Workspaces

Status: review

## Story

As a developer,
I want a Turborepo monorepo with pnpm workspaces initialized with the exact folder structure from the Architecture document,
so that every subsequent epic can be built in a properly isolated package without ad-hoc folder creation.

## Acceptance Criteria

1. **Given** an empty git repository, **When** a developer runs `pnpm install`, **Then** all workspace packages resolve without errors **And** the folder tree matches Architecture section 4: `apps/web`, `apps/dashboard`, `apps/admin`, `apps/api`, all `packages/` domain folders, and `tooling/`.
2. **Given** `turbo.json` is configured, **When** a developer runs `pnpm build`, **Then** Turborepo builds only packages affected by changes (incremental cache works) **And** the build passes with zero errors on a clean checkout.

## Tasks / Subtasks

- [x] Task 1: Initialize the repository root (AC: #1)
  - [x] Run `git init` (if not already a repo) and create a `.gitignore` covering `node_modules/`, `.turbo/`, `dist/`, `.next/`, `*.tsbuildinfo`, `.env*` (except `.env.example`)
  - [x] Create root `package.json` with `"private": true`, `"name": "leedi"`, `"packageManager": "pnpm@10.17.0"`, and `engines` requiring Node `>=22` and pnpm `>=9`
  - [x] Pin pnpm via `corepack enable` and a `packageManager` field; add `.npmrc` if needed (no implicit hoisting surprises)
- [x] Task 2: Configure pnpm workspaces (AC: #1)
  - [x] Create `pnpm-workspace.yaml` with `packages: ["apps/*", "packages/*", "tooling/*"]`
- [x] Task 3: Create all `apps/*` directory stubs (AC: #1)
  - [x] For each of `apps/web`, `apps/dashboard`, `apps/admin`, `apps/api`: create `package.json` named `@leedi/web`, `@leedi/dashboard`, `@leedi/admin`, `@leedi/api` respectively, and a minimal `src/index.ts` placeholder so the workspace resolves
- [x] Task 4: Create all `packages/*` domain directory stubs (AC: #1)
  - [x] For each package (`db`, `auth`, `ui`, `config`, `tenancy`, `connection`, `messaging`, `agent`, `agent-memory`, `knowledge`, `campaign`, `template`, `dispatch`, `sales-method`, `gateway`, `lead`, `billing`, `usage`, `notification`, `analytics`): create `package.json` named `@leedi/<name>` with `"main": "./src/index.ts"`, `"types": "./src/index.ts"`, and a stub `src/index.ts` exporting `export {};`
  - [x] Domain packages (all except `db`, `auth`, `ui`, `config`) also get the anatomy stub folders: `src/domain/`, `src/use-cases/`, `src/ports/`, `src/adapters/` (each with a `.gitkeep`)
- [x] Task 5: Create all `tooling/*` directory stubs (AC: #1)
  - [x] Create `tooling/eslint-config`, `tooling/tsconfig`, `tooling/tailwind-config` each with a `package.json` named `@leedi/eslint-config`, `@leedi/tsconfig`, `@leedi/tailwind-config` (config implementations land in Stories 1.2 and 1.5)
- [x] Task 6: Configure Turborepo (AC: #2)
  - [x] Install `turbo` as a root dev dependency
  - [x] Create `turbo.json` with tasks `build`, `test`, `lint`, `typecheck` and correct `dependsOn` graph (`build` depends on `^build`)
  - [x] Declare `outputs` for `build` (e.g. `dist/**`, `.next/**` excluding cache) so caching works
  - [x] Add root `package.json` scripts: `build`, `dev`, `lint`, `typecheck`, `test`, `format` each delegating to `turbo run <task>`
- [x] Task 7: Verify (AC: #1, #2)
  - [x] Run `pnpm install` from a clean clone and confirm zero resolution errors
  - [x] Run `pnpm build` twice and confirm the second run reports cache hits (`FULL TURBO` / cached)

## Dev Notes

- This story produces ONLY scaffolding. No business logic, no real schemas, no real UI. Stubs must compile and resolve, nothing more.
- Files to create at root: `package.json`, `pnpm-workspace.yaml`, `turbo.json`, `.gitignore`, `.npmrc`, `.env.example` (empty placeholder for now; populated in 1.3).
- Dependencies to install (root, dev): `turbo`, `typescript` (so workspace tsconfig references resolve), `prettier` (config arrives in 1.2 but installing now avoids churn).
- Architecture pattern: every package exposes ONLY `src/index.ts` as its public API (Architecture 2.1 / 4.1). Stub `index.ts` files enforce this contract from day one. Domain packages follow the anatomy in Architecture 4.1: `src/index.ts`, `src/domain/`, `src/use-cases/`, `src/ports/`, `src/adapters/`.
- Package naming is uniform: `@leedi/<folder-name>`. Use this exact scope so later workspace references (`"@leedi/config": "workspace:*"`) resolve.
- Testing standards: no unit tests in this story (nothing to test). The acceptance test is operational: a clean `pnpm install` resolves and `pnpm build` caches incrementally. Capture the second-run cache-hit output as evidence in Completion Notes.

### Pitfalls to avoid

- Do NOT scaffold real Next.js / Hono apps here — that is Story 1.6. Keep `apps/*` as resolvable stubs only, otherwise builds will fail before tooling (1.2) and config (1.3) exist.
- Do NOT set `"type": "module"` inconsistently across packages; pick one convention (ESM) and apply it uniformly to avoid resolution failures later.
- Do NOT add `workspace:*` cross-package dependencies yet beyond what a stub needs; wiring happens as each package becomes real.
- Avoid hoisting assumptions: with pnpm's strict node_modules, a package can only import deps it declares. Stubs declare nothing, so they must not import anything.
- Ensure `turbo.json` `outputs` are declared, or caching silently degrades to always-rebuild.

### Project Structure Notes

- The full tree must match Architecture section 4 exactly: 4 apps, 20 packages (`db`, `auth`, `ui`, `config` + 16 domain packages), 3 tooling packages.
- Domain packages requiring the 4.1 anatomy: `tenancy`, `connection`, `messaging`, `agent`, `agent-memory`, `knowledge`, `campaign`, `template`, `dispatch`, `sales-method`, `gateway`, `lead`, `billing`, `usage`, `notification`, `analytics`.
- Infra packages (`db`, `auth`, `ui`, `config`) and tooling packages do not need the full domain anatomy.

### References

- [Source: docs/01-leedi-arquitetura.md#4. Estrutura do monorepo]
- [Source: docs/01-leedi-arquitetura.md#4.1 Anatomia de um package de domínio]
- [Source: docs/01-leedi-arquitetura.md#2.1 Modularidade por contrato]
- [Source: _bmad-output/planning-artifacts/epics.md#Epic 1: Project Foundation & Developer Infrastructure]

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

### Completion Notes List

- pnpm version on machine is 10.17.0 (>= 9 requirement satisfied). packageManager field set to pnpm@10.17.0.
- Node v24.14.0 in use (>= 22 satisfied).
- git initialized fresh; baseline_commit set to first commit hash 0c24cef after initial files were staged.
- `pnpm install` resolved all 27 workspace packages with zero errors.
- Second `pnpm build` run: "Cached: 24 cached, 24 total >>> FULL TURBO" — AC #2 satisfied.
- Tooling packages (eslint-config, tsconfig, tailwind-config) intentionally have no `build` script at stub stage; configs land in Stories 1.2 and 1.5. This is expected per story spec.
- 16 domain packages created with full anatomy stubs (domain/, use-cases/, ports/, adapters/.gitkeep).
- 4 infra packages (db, auth, ui, config) created without anatomy per spec.

### File List

- package.json
- pnpm-workspace.yaml
- turbo.json
- .gitignore
- .npmrc
- .env.example
- apps/web/package.json
- apps/web/src/index.ts
- apps/dashboard/package.json
- apps/dashboard/src/index.ts
- apps/admin/package.json
- apps/admin/src/index.ts
- apps/api/package.json
- apps/api/src/index.ts
- packages/db/package.json, packages/db/src/index.ts
- packages/auth/package.json, packages/auth/src/index.ts
- packages/ui/package.json, packages/ui/src/index.ts
- packages/config/package.json, packages/config/src/index.ts
- packages/{tenancy,connection,messaging,agent,agent-memory,knowledge,campaign,template,dispatch,sales-method,gateway,lead,billing,usage,notification,analytics}/package.json + src/ anatomy
- tooling/eslint-config/package.json
- tooling/tsconfig/package.json
- tooling/tailwind-config/package.json
