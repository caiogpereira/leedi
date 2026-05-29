# Story 1.4: Set Up Database Package (Drizzle ORM + Supabase)

Status: ready-for-dev

## Story

As a developer,
I want `packages/db` with Drizzle ORM wired to Supabase with a working migration runner,
so that any domain package can define its schema and run migrations without database boilerplate.

## Acceptance Criteria

1. **Given** the Supabase connection string is present in env, **When** a developer runs `pnpm --filter @leedi/db migrate`, **Then** all pending migrations are applied to the Supabase database.
2. **Given** `packages/db` exports a typed `db` client, **When** any domain package runs a query, **Then** it imports `db` from `@leedi/db` **And** TypeScript infers column types from the schema.
3. **Given** a new migration file is added, **When** `pnpm migrate` runs in CI before deploy, **Then** the migration applies successfully before new code is active.

## Tasks / Subtasks

- [ ] Task 1: Install dependencies and create the client (AC: #2)
  - [ ] In `packages/db`, install `drizzle-orm`, `postgres` (postgres-js driver), and dev deps `drizzle-kit`
  - [ ] Create `src/client.ts` constructing the postgres-js connection using `env.DATABASE_URL` from `@leedi/config` and instantiate `drizzle(client, { schema })` via `drizzle-orm/postgres-js`
  - [ ] Configure the connection for Supabase pooling correctly: use the pooled connection string for the runtime client; for migrations use a single (non-pooled) connection with `max: 1` and `prepare: false` as required by the pooler
- [ ] Task 2: Establish the schema barrel (AC: #2)
  - [ ] Create `src/schema/index.ts` that re-exports all table definitions (empty for Epic 1 — just an `export {}` placeholder structure ready for later epics)
  - [ ] In `src/index.ts`, export `db` (the typed Drizzle client), `schema` (the schema object), and re-export commonly used Drizzle helpers if desired (`sql`, `eq`, etc. — optional)
- [ ] Task 3: Configure drizzle-kit (AC: #1, #3)
  - [ ] Create `packages/db/drizzle.config.ts` with `dialect: "postgresql"`, `schema: "./src/schema/index.ts"`, `out: "./migrations"`, and `dbCredentials.url` from `env.DATABASE_URL`
  - [ ] Create the `packages/db/migrations/` directory (with `.gitkeep`)
  - [ ] Add `package.json` scripts: `"generate": "drizzle-kit generate"`, `"migrate": "drizzle-kit migrate"`, `"check": "drizzle-kit check"`, `"studio": "drizzle-kit studio"`
- [ ] Task 4: Implement a programmatic migration runner for CI (AC: #1, #3)
  - [ ] Create `src/migrate.ts` that uses `drizzle-orm/postgres-js/migrator` `migrate()` against the `migrations/` folder, using a dedicated single-connection client, then closes the connection
  - [ ] Expose it via a script (`"migrate:run": "tsx src/migrate.ts"`) so CI can apply migrations deterministically before deploy
- [ ] Task 5: Verify wiring (AC: #1, #2)
  - [ ] With a valid `DATABASE_URL` (Supabase project or local), run `pnpm --filter @leedi/db generate` (no-op for empty schema) and `pnpm --filter @leedi/db migrate` to confirm the migrations table is created with no errors
  - [ ] Create a throwaway consumer in a stub package importing `db` and `schema` and confirm `tsc` resolves the types; remove it after
- [ ] Task 6: Tests (AC: #2)
  - [ ] Add Vitest; test that `src/index.ts` exports `db` and `schema` (smoke import) without requiring a live DB
  - [ ] Do not write integration tests against a live DB in this story; that arrives with the first real schema (later epic). Note this explicitly in Completion Notes.

## Dev Notes

- Architecture mandates Drizzle (not Prisma) for transparent SQL and versioned migrations (3.2), with migrations applied in CI before deploy (12). This story builds the empty foundation: NO real tables — the Tenancy schema and others come in later epics.
- Use `drizzle-orm/postgres-js` with the `postgres` driver per the technical context. Supabase exposes both a direct connection and a pooled (PgBouncer / Supavisor) connection. Critical: the pooler does not support prepared statements in transaction mode — pass `prepare: false` to `postgres()` for the pooled runtime client, and use a separate direct/single connection for `migrate`.
- The runtime `db` client reads `DATABASE_URL` from `@leedi/config` (Story 1.3), NOT `process.env` directly (respect the ESLint ban).
- Architecture 5.2 / 9.2 reference RLS as a safety net. RLS policies are NOT part of this story (no tables yet) but keep the migration mechanism compatible with raw SQL policies for later (Drizzle migrations are plain SQL files, which supports this).
- Dependencies: `drizzle-orm`, `postgres` (runtime), `drizzle-kit`, `tsx`, `vitest` (dev).
- Testing standards: smoke-test exports only here. Real DB integration tests follow the first schema-bearing epic (Architecture 11: V0 prioritizes domain + critical adapter tests).

### Pitfalls to avoid

- Do NOT use prepared statements with the Supabase transaction pooler — set `prepare: false`, or the runtime client will throw intermittently. This is the most common Supabase + postgres-js mistake.
- Do NOT run migrations through the pooled connection; use a direct single connection (`max: 1`). Mixing them causes lock/advisory-lock issues.
- Do NOT hardcode the connection string or read `process.env.DATABASE_URL` in code — import from `@leedi/config`.
- Do NOT generate a migration for an empty schema and commit a bogus empty SQL file; `generate` on an empty schema should be a no-op. The `migrate` command should still succeed (creating only the drizzle bookkeeping table).
- Avoid leaking the postgres connection in `migrate.ts` — always `await client.end()` in a finally block, or CI jobs hang.
- Drizzle-kit version and `drizzle-orm` version must be compatible; pin both and verify `drizzle.config.ts` uses the current `dialect` field (older configs used `driver`).

### Project Structure Notes

- New files: `packages/db/src/client.ts`, `packages/db/src/index.ts`, `packages/db/src/schema/index.ts`, `packages/db/src/migrate.ts`, `packages/db/drizzle.config.ts`, `packages/db/migrations/.gitkeep`.
- `packages/db` is an infra package — it does not follow the full domain anatomy (no `use-cases/ports/adapters`). It exposes `db` + `schema` as the contract.

### References

- [Source: docs/01-leedi-arquitetura.md#3.2 Por que Drizzle e não Prisma]
- [Source: docs/01-leedi-arquitetura.md#6. Schema do banco de dados] (future tables)
- [Source: docs/01-leedi-arquitetura.md#12. Ambientes e deploy] (migrations in CI before deploy)
- [Source: _bmad-output/planning-artifacts/epics.md#Story 1.4]

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

### Completion Notes List

### File List
