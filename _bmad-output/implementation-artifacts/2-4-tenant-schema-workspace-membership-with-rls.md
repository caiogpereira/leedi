# Story 2.4: Tenant Schema, Workspace & Membership with RLS

Status: ready-for-dev

## Story

As a developer,
I want the multi-tenant database schema (workspaces, tenants, users, memberships) implemented with RLS policies,
so that every future feature has tenant isolation guaranteed at the database level.

## Acceptance Criteria

1. **Given** the DB migration runs, **When** the schema is applied, **Then** tables `workspaces`, `tenants`, `users`, `memberships`, `workspace_admins`, `audit_logs` exist with the correct columns per Architecture section 6.1.
2. **Given** a user session has `tenant_id = X`, **When** any query runs with RLS active, **Then** only rows with `tenant_id = X` are returned regardless of explicit filters, **And** a query requesting `tenant_id = Y` (different tenant) returns zero rows.

## Tasks / Subtasks

- [ ] Task 1: Drizzle schema for tenancy (AC: #1)
  - [ ] Create `packages/db/src/schema/tenancy.ts` defining all six tables per Architecture 6.1:
    - [ ] `workspaces(id uuid pk, name text, created_at timestamptz default now())`
    - [ ] `tenants(id uuid pk, workspace_id uuid fk -> workspaces, name text, slug text unique, status text, plan text, logo_url text null, colors jsonb null, created_at timestamptz)`
    - [ ] `users(id uuid pk, email text unique, email_verified boolean default false, password_hash text, created_at timestamptz)`
    - [ ] `memberships(id uuid pk, user_id uuid fk -> users, tenant_id uuid fk -> tenants, role text, invited_by uuid null fk -> users, created_at timestamptz)` with `role` enum `'owner' | 'admin' | 'operator' | 'viewer'` and a unique constraint on `(user_id, tenant_id)`
    - [ ] `workspace_admins(id uuid pk, user_id uuid fk -> users, workspace_id uuid fk -> workspaces, role text, created_at timestamptz)` with `role` enum `'super_admin' | 'support'`
    - [ ] `audit_logs(id uuid pk, workspace_id uuid, actor_user_id uuid, target_tenant_id uuid null, acao text, detalhes jsonb null, created_at timestamptz default now())`
  - [ ] Re-export the tenancy schema from `packages/db/src/index.ts` (only public surface)
- [ ] Task 2: Generate + write migration (AC: #1)
  - [ ] Run Drizzle Kit to generate the migration into `packages/db/migrations/`
  - [ ] Add SQL to enable RLS and define policies (Task 3) in the same migration sequence
- [ ] Task 3: RLS policies (AC: #2)
  - [ ] `ALTER TABLE <t> ENABLE ROW LEVEL SECURITY; ALTER TABLE <t> FORCE ROW LEVEL SECURITY;` on every tenant-scoped table (`tenants`, `memberships`, and all future tenant-scoped tables created here)
  - [ ] For tenant-scoped tables with a `tenant_id`: `CREATE POLICY tenant_isolation ON <t> USING (tenant_id = current_setting('app.tenant_id')::uuid);`
  - [ ] `memberships` is special — it is BOTH tenant-scoped AND the junction used to bootstrap a user's tenant list BEFORE any tenant is selected. Add a SECOND read path keyed on the user: e.g. also allow `user_id = current_setting('app.user_id')::uuid`, OR expose a service-role/`withUser` enumeration path. Without this, login routing (Story 2.2) and `list-user-tenants` (Story 2.7) return zero rows because `app.tenant_id` is unset at that point.
  - [ ] For `tenants`: isolation policy keyed on `id = current_setting('app.tenant_id')::uuid` (the tenant's own row)
  - [ ] `audit_logs`: append-only — grant INSERT + SELECT, REVOKE UPDATE/DELETE; allow super-admin/service-role SELECT without tenant filter (separate policy/role)
  - [ ] `users`, `workspaces`, `workspace_admins`: not tenant-scoped — guard via app-layer + service-role, no `app.tenant_id` policy
- [ ] Task 4: Drizzle client wrapper that sets tenant context (AC: #2)
  - [ ] In `packages/db/src/index.ts`, export a `withTenant(tenantId, fn)` helper that runs `SET LOCAL app.tenant_id = '<uuid>'` at the start of a transaction and executes `fn` inside it
  - [ ] All tenant-scoped reads/writes MUST go through `withTenant`; document this as the package contract
  - [ ] Provide a `withWorkspaceAdmin()` / service-role path for super-admin queries that bypass tenant isolation deliberately
  - [ ] Provide a `withUser(userId, fn)` path that sets `app.user_id` for the membership-by-user bootstrap reads needed by Stories 2.2 (login routing) and 2.7 (`list-user-tenants`), where no tenant is selected yet
- [ ] Task 5: Tests — RLS isolation (AC: #2)
  - [ ] Integration test (local Supabase): create two tenants A and B with rows in `memberships`; under `app.tenant_id = A` a `SELECT *` returns only A's rows
  - [ ] Negative test: under `app.tenant_id = A`, an explicit `WHERE tenant_id = B` returns ZERO rows (RLS overrides the filter)
  - [ ] Test that `audit_logs` rejects UPDATE and DELETE (append-only)
  - [ ] Test `withTenant` sets and scopes `app.tenant_id` within the transaction and does not leak it across connections (SET LOCAL semantics)

## Dev Notes

- Files to create/modify: `packages/db/src/schema/tenancy.ts`, `packages/db/src/index.ts`, `packages/db/migrations/<generated>.sql`, `packages/db/drizzle.config.ts` (if not already configured).
- npm dependencies: `drizzle-orm`, `drizzle-kit`, `postgres` (or `@supabase/*` per Epic 1 setup). No `any` — type the schema strictly.
- Architecture pattern (6.1): this story is the foundation other epics depend on. The `withTenant` wrapper is THE enforcement point — every tenant-scoped use-case in later epics calls it.
- Better-Auth integration: Better-Auth (Stories 2.1–2.3) reads/writes the `users` table here. Coordinate column names with Better-Auth's `customUser` mapping (`email`, `email_verified`, `password_hash`).
- `memberships.role` and `workspace_admins.role` should be Postgres enums or text-with-check; prefer pgEnum for type safety.

### Security considerations

- RLS is the last line of defense: even with an application bug, data must not cross tenants. Use `FORCE ROW LEVEL SECURITY` so the table owner is also subject to policies.
- The DB connection role used by the app must NOT be a superuser/`BYPASSRLS` role. Verify the app role honors RLS; use a dedicated service role only for the explicit super-admin path.
- `SET LOCAL` (not `SET`) so the tenant context is transaction-scoped and cannot leak to the next query on a pooled connection. Test pooler behavior (Supabase transaction-mode pooler) explicitly.
- `audit_logs` is immutable: no UPDATE, no DELETE — ever. Enforce at the DB grant level, not just app code.
- `current_setting('app.tenant_id')` with the second arg `false` will error if unset — decide whether unset context should fail closed (recommended) vs return zero rows.

### Testing standards

- Integration tests run against a local Supabase/Postgres instance with the migration applied.
- Tests must use the same non-superuser app role the application uses, otherwise RLS is silently bypassed and the test is meaningless.
- Assert both positive isolation (only own rows) and negative (cross-tenant filter -> zero rows).

### Pitfalls to avoid

- Do NOT run tests as a superuser/BYPASSRLS role — RLS will appear to "work" while actually being skipped.
- Do NOT use `SET` instead of `SET LOCAL` — connection pooling will leak tenant context between requests (critical cross-tenant leak).
- Do NOT add RLS policies to `users`/`workspaces`/`workspace_admins` keyed on `app.tenant_id` — they are not tenant-scoped and would break auth.
- Do NOT forget `FORCE ROW LEVEL SECURITY`; without it the table owner bypasses policies.
- Do NOT allow the app role to have `BYPASSRLS`.

### Project Structure Notes

- All schema + migrations live in `packages/db`. No other package defines tables.
- `packages/db/src/index.ts` exports the schema, the Drizzle client, and `withTenant` — nothing internal leaks.

### References

- [Source: docs/01-leedi-arquitetura.md#6.1 Schema do banco]
- [Source: _bmad-output/planning-artifacts/epics.md#Story 2.4: Tenant Schema, Workspace & Membership with RLS]
- [Source: _bmad-output/planning-artifacts/epics.md#Epic 2: Multi-Tenant Identity & Access] (FR4, NFR1)

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

### Completion Notes List

### File List
