---
baseline_commit: dabf4c71c0d69af6644f573b678ca0de0bc7a2d7
---

# Story 1.3: Set Up Environment Config Package with Zod Validation

Status: in-progress

## Story

As a developer,
I want a `packages/config` package that defines and validates all environment variables with Zod at boot,
so that the app never starts with a missing or malformed env var.

## Acceptance Criteria

1. **Given** a required env var (e.g., `DATABASE_URL`) is missing from `.env`, **When** any app starts, **Then** the process exits immediately with a clear error message listing which variable is missing **And** no app routes or handlers are registered before validation passes.
2. **Given** all required env vars are present, **When** an app starts, **Then** the app boots successfully **And** the parsed config object is fully typed.
3. **Given** `packages/config` exports the validated config schema, **When** any domain package imports config values, **Then** it imports from `@leedi/config`, not from `process.env` directly.

## Tasks / Subtasks

- [ ] Task 1: Create the config package skeleton (AC: #2, #3)
  - [ ] In `packages/config`, install `zod`
  - [ ] Create `src/schema.ts` defining a single `z.object({...})` describing all env vars with correct types and coercion (e.g. `NODE_ENV: z.enum(["development","test","production"])`, `DATABASE_URL: z.string().url()`, `SENTRY_DSN: z.string().url()`, `POSTHOG_KEY: z.string().min(1)`, `BETTER_STACK_TOKEN: z.string().min(1)`)
  - [ ] Use `z.coerce.number()` for any numeric vars (e.g. ports added in 1.6) and sensible defaults where appropriate
- [ ] Task 2: Implement boot-time validation (AC: #1, #2)
  - [ ] In `src/index.ts`, run `const parsed = schema.safeParse(process.env)` at module load
  - [ ] On failure, format `parsed.error.flatten()` into a human-readable list of missing/invalid vars, print to stderr, and `process.exit(1)` (Node) — validation must happen at import time so it runs BEFORE any route registration
  - [ ] On success, export a frozen, fully-typed `env` object and an inferred `Env` type (`z.infer<typeof schema>`)
  - [ ] Export the `schema` itself for testing/tooling
- [ ] Task 3: Provide `.env.example` and documentation (AC: #1)
  - [ ] Update root `.env.example` to list every required variable with placeholder values and a one-line comment each
  - [ ] Add a short README in `packages/config` documenting how to add a new env var (schema-first)
- [ ] Task 4: Enforce no direct `process.env` access elsewhere (AC: #3)
  - [ ] Add an ESLint rule to `@leedi/eslint-config` (`no-restricted-properties` / `no-process-env`) banning `process.env` access outside `packages/config`
  - [ ] Add an override in `packages/config`'s own ESLint config to allow `process.env` there
  - [ ] Run `pnpm lint` and confirm no violations exist (all current stubs use no env yet)
- [ ] Task 5: Tests (AC: #1, #2)
  - [ ] Add Vitest to `packages/config`
  - [ ] Test: parsing a complete fixture env object succeeds and returns the typed object
  - [ ] Test: parsing with `DATABASE_URL` removed fails and the formatted error message names `DATABASE_URL`
  - [ ] Test: invalid format (e.g. `DATABASE_URL=not-a-url`) fails with a clear message
  - [ ] Note: test the pure `schema.safeParse` path; do not test `process.exit` directly (isolate the exit-on-failure logic into a testable function that returns a Result, and call `process.exit` only in the index module entry)
- [ ] Task 6: Verify acceptance (AC: #1, #2, #3)
  - [ ] With a missing var, confirm the process exits with code 1 and a clear message
  - [ ] With all vars present, confirm `env` is typed (hover/`tsc` shows the inferred shape)

## Dev Notes

- Required env vars for Epic 1 (per story spec): `DATABASE_URL`, `SENTRY_DSN`, `POSTHOG_KEY`, `BETTER_STACK_TOKEN`, `NODE_ENV`. Ports (`API_PORT`, etc.) are added in Story 1.6 — extend the schema there, do not pre-add speculative vars now beyond these five.
- Architecture: env validated with Zod at boot (Stack table / principles). The whole point of AC #1 is fail-fast BEFORE routes register — so validation must execute as a top-level side effect at import time of `@leedi/config`, and apps must import `@leedi/config` at their entry point before wiring routes.
- `@leedi/config` is consumed by both Node (Hono API) and Next.js apps. `process.env` is available in both for server-side code. For Next.js client-side public vars, that is out of scope for Epic 1 (no client env vars in the required list) — keep this package server-only for now and do not expose secrets to the client.
- Make the validate-and-format logic a pure exported function so it is unit-testable without triggering `process.exit`; the `index.ts` module calls that function and performs the exit.
- Dependencies to install: `zod` (runtime), `vitest` (dev).

### Pitfalls to avoid

- Do NOT use `schema.parse()` directly at module top level and let the raw `ZodError` stack trace be the user-facing message — AC #1 requires a CLEAR message listing the missing variable. Use `safeParse` + `flatten()` + formatted output.
- Do NOT read `process.env` lazily per-call; parse once at boot and export the immutable result. Lazy reads defeat fail-fast.
- Do NOT add the `no-process-env` ESLint rule without an exception for `packages/config` itself — otherwise the package can't read env at all.
- Avoid `z.string().nonempty()` (deprecated in recent Zod); use `z.string().min(1)`.
- Do not freeze with `as const` only; use `Object.freeze` on the runtime object to prevent mutation, while `z.infer` provides the static type.
- Ensure the schema rejects, not silently coerces, an empty-string `DATABASE_URL` (empty string can pass a naive `z.string()`); use `.url()` / `.min(1)`.

### Project Structure Notes

- New files: `packages/config/src/schema.ts`, `packages/config/src/index.ts`, `packages/config/src/validate.ts` (testable pure fn), `packages/config/README.md`, root `.env.example`.
- ESLint rule change lives in `tooling/eslint-config` and applies repo-wide with a `packages/config` override.

### References

- [Source: docs/01-leedi-arquitetura.md#3.1 Tabela-resumo] (env validation at boot)
- [Source: docs/01-leedi-arquitetura.md#9.1 Segredos e tokens]
- [Source: _bmad-output/planning-artifacts/epics.md#Story 1.3]

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

### Completion Notes List

### File List
