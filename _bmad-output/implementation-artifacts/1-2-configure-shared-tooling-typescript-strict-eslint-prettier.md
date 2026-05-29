---
baseline_commit: 0c24cef7d86847502df196e0c8ae880427a2ec6a
---

# Story 1.2: Configure Shared Tooling (TypeScript Strict, ESLint, Prettier)

Status: in-progress

## Story

As a developer,
I want TypeScript strict mode, ESLint, and Prettier configured in `tooling/` and inherited by every package and app,
so that type safety and code style are enforced consistently across the entire codebase from day one.

## Acceptance Criteria

1. **Given** TypeScript is configured with `strict: true` in `tooling/tsconfig/`, **When** any package has a type error, **Then** `pnpm typecheck` fails with a clear error pointing to the offending file and line.
2. **Given** ESLint is configured in `tooling/eslint-config/`, **When** a developer imports from `packages/agent/src/use-cases/process-message.ts` directly (cross-domain internal import), **Then** ESLint reports an error: cross-domain internal import forbidden **And** `pnpm lint` exits with code 1.
3. **Given** Prettier is configured, **When** a developer runs `pnpm format`, **Then** all files are formatted consistently **And** `pnpm lint` passes afterwards.

## Tasks / Subtasks

- [ ] Task 1: Build the shared TypeScript config package (AC: #1)
  - [ ] In `tooling/tsconfig`, create `base.json` with compiler options: `"strict": true`, `"exactOptionalPropertyTypes": true`, `"noUncheckedIndexedAccess": true`, `"noImplicitOverride": true`, `"noFallthroughCasesInSwitch": true`, `"isolatedModules": true`, `"skipLibCheck": true`, `"moduleResolution": "Bundler"` (or `"NodeNext"` — match the module system chosen in 1.1), `"target": "ES2022"`, `"declaration": true`, `"composite": false`
  - [ ] Create `nextjs.json` extending `base.json` with Next.js-specific settings (`"jsx": "preserve"`, `"plugins": [{ "name": "next" }]`, `"noEmit": true`)
  - [ ] Create `node.json` extending `base.json` for the Hono API and Node packages (`"module": "ESNext"`, lib `["ES2022"]`)
  - [ ] Set `"name": "@leedi/tsconfig"` in `tooling/tsconfig/package.json` and ensure files are published via `"files"`
- [ ] Task 2: Wire every package to the shared tsconfig (AC: #1)
  - [ ] In each package/app `tsconfig.json`, `"extends": "@leedi/tsconfig/base.json"` (or `nextjs.json` / `node.json` as appropriate) and set `include`/`outDir`
  - [ ] Add `@leedi/tsconfig: "workspace:*"` to each package's devDependencies
  - [ ] Add a `typecheck` script (`tsc --noEmit`) to each package and confirm `turbo run typecheck` aggregates them
- [ ] Task 3: Build the shared ESLint config package (AC: #2)
  - [ ] In `tooling/eslint-config`, create the flat-config (`index.js` / `index.mjs`) exporting a base config with `@typescript-eslint`, import ordering, and Prettier compatibility (`eslint-config-prettier` to disable stylistic conflicts)
  - [ ] Add a `no-restricted-imports` rule with patterns banning deep internal imports across packages: pattern `@leedi/*/src/**` and relative paths that escape a package boundary; message: "cross-domain internal import forbidden — import from the package public API (@leedi/<name>) only"
  - [ ] Export specialized variants: `next.js` (extends base + `eslint-plugin-react`, `eslint-plugin-react-hooks`, Next plugin) and `node.js` for the API
  - [ ] Set `"name": "@leedi/eslint-config"` in its `package.json`
- [ ] Task 4: Wire every package to the shared ESLint config (AC: #2)
  - [ ] Add an `eslint.config.js` (flat config) in each package importing the appropriate variant from `@leedi/eslint-config`
  - [ ] Add `@leedi/eslint-config: "workspace:*"` to each package's devDependencies
  - [ ] Add a `lint` script (`eslint .`) to each package and confirm `turbo run lint` aggregates them
- [ ] Task 5: Configure Prettier (AC: #3)
  - [ ] Create root `.prettierrc` (e.g. `printWidth: 100`, `singleQuote: true`, `semi: true`, `trailingComma: "all"`) and `.prettierignore`
  - [ ] Add root scripts: `format` (`prettier --write .`) and `format:check` (`prettier --check .`)
  - [ ] Ensure ESLint and Prettier do not conflict (via `eslint-config-prettier`)
- [ ] Task 6: Verify acceptance (AC: #1, #2, #3)
  - [ ] Temporarily introduce a type error in a stub package, run `pnpm typecheck`, confirm non-zero exit pointing to file/line, then revert
  - [ ] Temporarily add a forbidden import (`import x from '@leedi/agent/src/use-cases/process-message'`), run `pnpm lint`, confirm exit code 1 with the cross-domain message, then revert
  - [ ] Run `pnpm format` then `pnpm lint` and confirm lint passes

## Dev Notes

- Dependencies to install (in `tooling/eslint-config`): `eslint` (v9+, flat config), `typescript-eslint`, `eslint-config-prettier`, `eslint-plugin-import` (or the typescript-eslint resolver), and for the Next variant `eslint-plugin-react`, `eslint-plugin-react-hooks`, `@next/eslint-plugin-next`. In root: `prettier`.
- The cross-domain import ban is the load-bearing rule of this story and enforces Architecture 2.1 ("Modularidade por contrato" — `index.ts` is the only entry point). Implement it via `no-restricted-imports` (and/or `eslint-plugin-import` `no-internal-modules`). Test it explicitly.
- Use ESLint 9 flat config (`eslint.config.js`). Do NOT mix legacy `.eslintrc`. Flat config composes cleanly across the monorepo.
- `exactOptionalPropertyTypes` and `noUncheckedIndexedAccess` are intentionally strict and will surface real bugs later; do not relax them to make stubs pass — fix the code instead.
- Testing standards: the verification tasks (Task 6) ARE the acceptance test. Capture the failing-then-passing transitions as evidence. No Vitest suite needed in this story.

### Pitfalls to avoid

- Do NOT add `// eslint-disable` or `@ts-ignore` to silence the strict checks introduced here — that defeats the story.
- Do NOT use `any` to make typecheck pass (Architecture: strict mode everywhere, no `any` without justification).
- A common mistake: the `no-restricted-imports` pattern only catches bare-specifier deep imports but not relative `../../agent/src/...` traversal. Add a second guard (e.g. `no-internal-modules` / restricted relative patterns) so both forms are blocked.
- Ensure `eslint-config-prettier` is applied LAST so it can turn off conflicting stylistic rules; otherwise `format` and `lint` will fight (AC #3 will fail).
- Do not enable `composite`/project references unless you also wire `tsc --build`; for `--noEmit` typecheck per package, plain `extends` is simpler and sufficient.

### Project Structure Notes

- Config implementations land in `tooling/tsconfig/` (`base.json`, `nextjs.json`, `node.json`) and `tooling/eslint-config/` (`index.js` + variants). Prettier config is at repo root.
- Every `apps/*` and `packages/*` from Story 1.1 must gain a `tsconfig.json` and `eslint.config.js` that extend/import the shared configs.

### References

- [Source: docs/01-leedi-arquitetura.md#2.1 Modularidade por contrato]
- [Source: docs/01-leedi-arquitetura.md#3.1 Tabela-resumo] (TypeScript strict)
- [Source: _bmad-output/planning-artifacts/epics.md#Story 1.2]

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

### Completion Notes List

### File List
