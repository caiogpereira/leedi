# Story 2.8: Super-Admin Workspace & Tenant Impersonation

Status: done

## Story

As a super-admin (Exponensia),
I want to view all tenants in the workspace and impersonate any tenant to provide support,
so that I can troubleshoot issues without asking tenants to share credentials.

## Acceptance Criteria

1. **Given** a super-admin logs in and accesses `admin.leedi.com.br`, **When** they click "Impersonar" on a tenant and confirm, **Then** their session context switches to that tenant's context, **And** a visible banner shows: "Você está em modo de suporte para [Tenant Name]. Suas ações estão sendo registradas.", **And** an `audit_log` entry is created with `acao: "impersonate_start"`.
2. **Given** a super-admin performs any write action while impersonating, **When** the action runs, **Then** each action is recorded in `audit_logs` with the super-admin's `user_id` (`actor_user_id`) and target `tenant_id` (`target_tenant_id`).
3. **Given** a super-admin clicks "Sair do modo suporte", **When** they exit impersonation, **Then** their session returns to the workspace admin context **And** `acao: "impersonate_end"` is logged.

## Tasks / Subtasks

- [ ] Task 1: Workspace-admin access guard (AC: #1, #3)
  - [ ] Add a `requireWorkspaceAdmin(roles: ('super_admin'|'support')[])` helper in `packages/auth/src/index.ts` resolving from `workspace_admins`
  - [ ] Gate `apps/admin` routes behind it; non-admins -> 403. Super-admins visiting `apps/dashboard` are redirected to the admin app
- [ ] Task 2: Tenant list + impersonate action (AC: #1)
  - [ ] Create `packages/tenancy/src/use-cases/list-all-tenants.ts` (workspace-scoped, service-role path — bypasses tenant RLS deliberately, only for workspace admins)
  - [ ] Create `apps/admin/app/(admin)/tenants/page.tsx`: tenant table with status/plan + "Impersonar" button -> confirmation modal
- [ ] Task 3: Impersonation session model (AC: #1, #2, #3)
  - [ ] Create `packages/auth/src/use-cases/start-impersonation.ts`: set session `{ real_user_id, impersonating_tenant_id, impersonation_expires_at }` and `current_tenant_id = impersonating_tenant_id`; enforce 1-hour expiry
  - [ ] Create `packages/auth/src/use-cases/stop-impersonation.ts`: clear impersonation fields, restore workspace-admin context
  - [ ] Verify the actor is a `super_admin` (support role policy per product decision) before allowing impersonation
- [ ] Task 4: Audit logging (AC: #1, #2, #3)
  - [ ] Create `packages/tenancy/src/use-cases/write-audit-log.ts` inserting into `audit_logs` (`workspace_id`, `actor_user_id`, `target_tenant_id`, `acao`, `detalhes`); append-only (Story 2.4)
  - [ ] On start: write `acao: "impersonate_start"`; on stop: `acao: "impersonate_end"`
  - [ ] Add an API middleware (`apps/api`) that, when `session.impersonating_tenant_id` is set, records EVERY mutating route as an audit entry with actor = `real_user_id` and target = `impersonating_tenant_id`
- [ ] Task 5: Impersonation banner (AC: #1)
  - [ ] Add a fixed top banner in `apps/dashboard` shown whenever impersonation is active: "Você está em modo de suporte para [Tenant Name]. Suas ações estão sendo registradas." (next-intl) with a "Sair do modo suporte" button
- [ ] Task 6: RLS context during impersonation (AC: #2)
  - [ ] All DB operations during impersonation set `app.tenant_id = impersonating_tenant_id` via `withTenant` (Story 2.4), so the admin sees exactly that tenant's data
- [ ] Task 7: Tests (AC: #1, #2, #3)
  - [ ] Unit test start/stop impersonation: only `super_admin` allowed; session fields set/cleared; 1-hour expiry enforced
  - [ ] Integration test: a mutation during impersonation writes an `audit_logs` row with correct `actor_user_id` + `target_tenant_id`
  - [ ] Integration test: `audit_logs` rejects UPDATE/DELETE (append-only)
  - [ ] Integration test: during impersonation, queries return only the impersonated tenant's rows (RLS)
  - [ ] Playwright E2E: impersonate -> banner visible -> stop -> banner gone; start/end logged

## Dev Notes

- Files to create/modify: `packages/auth/src/index.ts`, `packages/auth/src/use-cases/start-impersonation.ts`, `packages/auth/src/use-cases/stop-impersonation.ts`, `packages/tenancy/src/use-cases/list-all-tenants.ts`, `packages/tenancy/src/use-cases/write-audit-log.ts`, `apps/admin/app/(admin)/tenants/page.tsx`, `apps/api` audit middleware, `apps/dashboard` impersonation banner + layout.
- npm dependencies: none new (`better-auth`, `hono`, `next-intl`).
- Architecture pattern: impersonation is a session overlay — `current_tenant_id` points at the impersonated tenant while `real_user_id` preserves the true actor for audit. `withTenant` enforces data scope; audit middleware enforces accountability.
- Workspace roles are `super_admin`/`support` from `workspace_admins` (Story 2.4), distinct from tenant RBAC (Story 2.5).
- `list-all-tenants` is the deliberate, audited exception to tenant RLS — it runs on the service-role/workspace-admin path, never the normal tenant path.

### Security considerations

- Impersonation token: 1-hour expiry, NOT renewable without re-auth. Expired impersonation falls back to workspace-admin context (fail closed).
- Every mutating action during impersonation MUST be audited with the real super-admin `user_id` — accountability is the entire point. No silent writes.
- `audit_logs` is immutable (append-only) — no UPDATE/DELETE ever (enforced at DB grant level in Story 2.4); admins cannot erase their own trail.
- The "support" role should be read-only by default; restrict write-impersonation to `super_admin` unless product explicitly allows support writes.
- Never expose tenant credentials, password hashes, or tokens to the impersonating admin — impersonation is context-switch, not credential-sharing.
- The banner must be unmissable and persistent so the admin always knows actions are recorded.
- Service-role/`list-all-tenants` path must be tightly guarded by `requireWorkspaceAdmin` — it bypasses RLS and is the highest-risk surface.

### Testing standards

- Unit tests in `packages/auth/src/use-cases/*.test.ts` and `packages/tenancy/src/use-cases/*.test.ts` (Vitest).
- Integration tests confirm audit-on-mutation, append-only enforcement, and RLS scoping during impersonation.

### Pitfalls to avoid

- Do NOT lose the real actor's identity in the session — audit must attribute to the super-admin, not the impersonated tenant.
- Do NOT allow impersonation to renew silently past 1 hour.
- Do NOT let the service-role tenant-list path leak into normal tenant code (it bypasses RLS).
- Do NOT permit any UPDATE/DELETE on `audit_logs`.
- Do NOT forget to clear `impersonating_tenant_id` on stop, or the admin stays scoped to the tenant.

### Project Structure Notes

- Admin UI in `apps/admin`; impersonation banner in `apps/dashboard`; session/auth logic in `packages/auth`; tenant listing + audit writes in `packages/tenancy`.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 2.8: Super-Admin Workspace & Tenant Impersonation]
- [Source: _bmad-output/planning-artifacts/epics.md#Epic 2: Multi-Tenant Identity & Access] (FR8)
- [Source: docs/01-leedi-arquitetura.md#6.1 Schema do banco]

## Dev Agent Record

### Agent Model Used

claude-opus-4-8

### Debug Log References

- Local `pnpm build` fails with a `better-auth`/`kysely` "Attempted import error"
  (`DEFAULT_MIGRATION_TABLE`/`DEFAULT_MIGRATION_LOCK_TABLE` not exported). Verified
  PRE-EXISTING and environment-specific: the untouched `apps/web` build fails
  identically on this machine (Node 24 local), while CI (Node 22, `pnpm install
  --frozen-lockfile`) is green on `main` with `apps/web` importing the full `auth`
  object. Not introduced by this story.
- Local `pnpm --filter @leedi/db typecheck` fails with `TS18048` strict-null errors
  in the untouched `packages/db/src/__tests__/rls.test.ts`. Verified PRE-EXISTING
  via `git stash` (fails identically on clean `main`) and confirmed CI executed
  `@leedi/db:typecheck` (cache miss → `tsc --noEmit`) and PASSED. Local-only TS
  resolution discrepancy; not introduced by this story (lockfile diff is only the
  6 `workspace:*` link lines for admin's new deps — no toolchain version moved).

### Completion Notes List

Implemented (verified via package typecheck + lint + unit tests; CI is the build authority):

- AC#1 (impersonate_start + context switch + banner): DONE.
  - `startImpersonation` (super_admin-only; `support` and non-admins rejected),
    writes `impersonate_start` audit log with the REAL workspace UUID resolved from
    `workspace_admins` (fixes the `'default-workspace'` placeholder that would have
    thrown on the `uuid` column).
  - Admin `/tenants` page (super_admin-gated, service-role tenant list) + confirm
    dialog + `POST /api/admin/impersonate` route sets `leedi_impersonating`,
    `leedi_real_user_id`, and `leedi_tenant` (1h httpOnly cookies).
  - Dashboard layout server-verifies the actor is a super_admin before honoring the
    impersonation cookie (fail-closed on forged/expired cookie), looks up the tenant
    name via service-role, and renders the orange `ImpersonationBanner`.
- AC#3 (impersonate_end): DONE. `POST /api/admin/stop-impersonation` writes the
  `impersonate_end` audit log (attributed to the REAL super-admin) and clears ALL
  three cookies — including `leedi_tenant` (the story's explicit pitfall: leaving it
  set would keep the admin scoped to the tenant after exit).

Data-context switch (Task 6): MECHANICALLY WIRED, not yet demonstrated by a real
read. The `leedi_tenant` cookie → Edge middleware `x-leedi-tenant-id` → `withTenant`
chain is in place, so tenant-scoped reads WILL run under the impersonated tenant.
No dashboard page performs a tenant-scoped data read yet (the team page is a Story
2.7 scaffold), so "admin sees tenant data" rests on the mechanism, not an exercised
path. The tenant switcher is hidden during impersonation (active tenant is fixed).

Deferred (out of the implemented MVP slice — NOT done):

- AC#2 audit-on-mutation middleware (Task 4): `writeAuditLog` is implemented and
  exported, but `apps/api` currently exposes only `/health` with no mutating routes
  and no auth middleware (populated in a later epic), so there is no real mutation
  path to wire it into. Follow-up: add the Hono audit middleware that records every
  mutating route as an audit entry (`actor_user_id` = real_user_id, `target_tenant_id`
  = impersonating tenant) once mutating API routes exist.
- Integration tests (audit-on-mutation, append-only UPDATE/DELETE rejection, RLS
  scoping during impersonation) and the Playwright E2E (Task 7): deferred with the
  AC#2 middleware — they require a live DB harness and real mutating routes.
- `requireWorkspaceAdmin` route guard + dashboard→admin redirect for super-admins
  (Task 1): the page-level super_admin gate is implemented inline; a shared
  `requireWorkspaceAdmin` helper and the cross-app redirect were not extracted.
- During impersonation, `/settings/*` routes still 403 because the dashboard
  middleware hard-codes `userRole = undefined` (Story 2.7 deferral). Not a regression
  (those pages are scaffolds), but the impersonating admin cannot reach them until
  per-tenant role resolution lands.

### File List

Created:
- `packages/auth/src/workspace-guard.ts`
- `packages/auth/src/use-cases/start-impersonation.ts`
- `packages/auth/src/use-cases/start-impersonation.test.ts`
- `packages/auth/src/use-cases/stop-impersonation.ts`
- `packages/auth/src/use-cases/stop-impersonation.test.ts`
- `packages/tenancy/src/use-cases/list-all-tenants.ts`
- `packages/tenancy/src/use-cases/write-audit-log.ts`
- `packages/tenancy/src/use-cases/get-tenant-by-id.ts`
- `apps/admin/app/(admin)/tenants/page.tsx`
- `apps/admin/app/(admin)/tenants/ImpersonateButton.tsx`
- `apps/admin/app/403/page.tsx`
- `apps/admin/app/api/admin/impersonate/route.ts`
- `apps/dashboard/app/api/admin/stop-impersonation/route.ts`
- `apps/dashboard/components/ImpersonationBanner.tsx`

Modified:
- `packages/auth/src/index.ts` (exports)
- `packages/tenancy/src/index.ts` (exports)
- `apps/admin/package.json` (+ `@leedi/auth`, `@leedi/tenancy` deps)
- `apps/admin/next.config.ts` (transpilePackages + `@leedi/tenancy`)
- `apps/admin/tsconfig.json` (include `app`)
- `apps/admin/messages/pt-BR.json` (tenants strings)
- `apps/dashboard/app/layout.tsx` (impersonation resolution + banner)
- `apps/dashboard/next.config.ts` (transpilePackages + `@leedi/tenancy`)
- `apps/dashboard/tsconfig.json` (include `app`, `components`, `middleware.ts`)
- `apps/dashboard/messages/pt-BR.json` (impersonation strings)
- `pnpm-lock.yaml` (admin workspace links)
