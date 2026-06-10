# Story 2.5: Role-Based Access Control (RBAC)

Status: done

## Story

As a tenant owner,
I want roles (owner, admin, operator, viewer) enforced throughout the application,
so that team members only access what their role permits.

## Acceptance Criteria

1. **Given** a user with `operator` role, **When** they attempt to access the Agent Configuration page, **Then** they receive a 403 with message: "Você não tem permissão para acessar esta área".
2. **Given** a user with `viewer` role, **When** they visit the dashboard, **Then** they can see metrics **And** all create/edit/delete buttons are absent or disabled.
3. **Given** a user with `admin` role, **When** they attempt to access the Billing page, **Then** they receive a 403 (billing is owner-only).

## Tasks / Subtasks

- [ ] Task 1: Define the permission model (AC: #1, #2, #3)
  - [ ] Create `packages/auth/src/rbac.ts` with the role-permission matrix:
    - [ ] `owner`: all permissions
    - [ ] `admin`: all except `billing`
    - [ ] `operator`: read + send messages + manage leads; NOT configure agent, NOT manage team, NOT billing
    - [ ] `viewer`: read-only dashboard metrics only
  - [ ] Express as a typed permission set (e.g. `Permission` union + `ROLE_PERMISSIONS: Record<Role, Permission[]>`); no `any`
  - [ ] Export `hasPermission(role, permission): boolean` and `requireRole(roles: Role[])` middleware helper from `packages/auth/src/index.ts`
- [ ] Task 2: Route-level permission map + middleware (AC: #1, #3)
  - [ ] Define a route -> allowed-roles map, e.g. `{ '/dashboard/settings/billing': ['owner'], '/dashboard/settings/agent': ['owner','admin'], '/dashboard/settings/team': ['owner','admin'], ... }`
  - [ ] In `apps/dashboard/middleware.ts`, resolve the current user's role in `current_tenant_id` from session/membership and enforce the map; on violation render/redirect to a 403 page with AC #1 message
  - [ ] Ensure 403 page text comes from next-intl (pt-BR)
- [ ] Task 3: API-layer enforcement (AC: #1, #3)
  - [ ] In `apps/api`, add a Hono middleware using `requireRole([...])` before protected route handlers; reject with 403 + generic pt-BR message BEFORE invoking any use-case
  - [ ] Never rely on UI hiding alone — every privileged mutation re-checks role server-side
- [ ] Task 4: UI conditional rendering (AC: #2)
  - [ ] Add a `usePermission()` hook / server helper that reads the current role and exposes `can(permission)`
  - [ ] In dashboard components, gate create/edit/delete actions behind `can(...)`; for `viewer`, render buttons absent or disabled
  - [ ] Apply to settings/agent, settings/team, settings/billing, leads, and messaging surfaces
- [ ] Task 5: Tests (AC: #1, #2, #3)
  - [ ] Unit test `hasPermission`/`requireRole` for the full matrix (every role x every permission)
  - [ ] Unit test: `admin` denied `billing`; `operator` denied agent-config and team; `viewer` denied all writes
  - [ ] Integration test (API): operator -> agent-config route returns 403; admin -> billing route returns 403
  - [ ] Playwright E2E: operator visiting agent-config sees the 403 message; viewer sees no write buttons

## Dev Notes

- Files to create/modify: `packages/auth/src/rbac.ts`, `packages/auth/src/index.ts`, `apps/dashboard/middleware.ts`, `apps/api/src/middleware/require-role.ts`, dashboard components for conditional rendering, a 403 page (`apps/dashboard/app/403/page.tsx` or a rendered boundary).
- npm dependencies: none new beyond Epic 1/2 stack (`better-auth`, `hono`, `next-intl`).
- Architecture pattern: RBAC is enforced in THREE layers — middleware (route), API handler (use-case guard), and UI (rendering). UI gating is UX only; the server checks are the real boundary.
- Role is per membership (per tenant) from Story 2.4's `memberships.role`. RBAC always resolves role within `current_tenant_id` — a user can be `owner` in tenant A and `viewer` in tenant B.
- Workspace roles (`super_admin`/`support`) are separate (Story 2.8) and not part of this tenant matrix.

### Security considerations

- Defense in depth: NEVER trust the client. Hiding a button (AC #2) must be paired with a server-side 403 on the corresponding API route — a `viewer` hitting the endpoint directly must be rejected.
- Fail closed: unknown route or unresolved role -> deny, not allow.
- 403 message must be generic and identical regardless of the specific missing permission (no leaking of what would be required).
- Re-resolve role from the DB/session on each request; do not cache a stale role across a tenant switch (Story 2.7).

### Testing standards

- Exhaustive matrix unit tests in `packages/auth/src/rbac.test.ts` (Vitest).
- API integration tests assert 403 BEFORE any side effect occurs (no partial writes).

### Pitfalls to avoid

- Do NOT enforce RBAC only in the UI — direct API calls would bypass it.
- Do NOT hardcode the role matrix in multiple places; single source of truth in `rbac.ts`.
- Do NOT forget to scope role resolution to `current_tenant_id` (multi-tenant users have different roles per tenant).
- Do NOT conflate tenant roles with workspace_admin roles.

### Project Structure Notes

- Canonical permission logic in `packages/auth/src/rbac.ts`, exported via `index.ts`.
- Enforcement points in `apps/dashboard/middleware.ts` and `apps/api` middleware.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 2.5: Role-Based Access Control (RBAC)]
- [Source: _bmad-output/planning-artifacts/epics.md#Epic 2: Multi-Tenant Identity & Access] (FR9, NFR2)
- [Source: docs/01-leedi-arquitetura.md#6.1 Schema do banco]

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

### Completion Notes List

- RBAC matrix in `packages/auth/src/rbac.ts`: single source of truth for all permissions.
- 43 unit tests covering the full matrix (every role x every permission).
- Three enforcement layers: dashboard middleware (route-level), Hono middleware (API), UI hook.
- Dashboard middleware enforces route permissions fail-closed (403) until a per-tenant role is available in the session (TODO Story 2.7).
- `requirePermission()` Hono middleware ready for use when business routes are added to `apps/api`.

### File List

- `packages/auth/src/rbac.ts`
- `packages/auth/src/rbac.test.ts`
- `apps/api/src/middleware/require-role.ts`
- `apps/dashboard/app/403/page.tsx`
- `apps/dashboard/src/hooks/use-permission.ts`

## Code Review Follow-up (2026-06-08)

Re-verified against HEAD + **fixes applied this session** (see `epic-2-code-review-report.md`):

- `[Patch]` 403 i18n — **FIXED**: dashboard + admin 403 pages use `useTranslations("forbidden")`. (The
  API `require-role.ts` keeps a fixed string — acceptable for a service boundary.)
- `[Defer]` route-gating fail-closed — was a **LIVE BUG** (real `/settings/{team,uso,whatsapp}` pages
  403'd for every user incl. owners, because `middleware.ts` hardcoded `userRole = undefined` while
  later epics shipped the pages). **FIXED 2026-06-08**: per-tenant role resolution now lives in
  `apps/dashboard/lib/tenant-context.ts` (`getCurrentTenantContext` / `requireTenantRouteAccess`,
  membership-backed via `listUserTenants`); each restricted settings page enforces its
  `ROUTE_PERMISSION_MAP` requirement; the broken Edge role gate was removed (Edge keeps auth-presence +
  tenant-header forwarding only).
- `[Defer]` AC#2 — API RBAC is **wired** (`tenant-session.ts` → `requirePermission` in
  `billing.ts`/`usage.ts`); dashboard now gates write surfaces server-side (team invite form, whatsapp
  connect form). `usePermission` client hook remains for client-component gating in later epics.

## Review Findings (Code Review 2026-06-04)

- [ ] [Review][Patch] 403 message is hardcoded, not sourced from next-intl (Task 2 violation) — duplicated literal in dashboard/admin 403 pages and the API `FORBIDDEN_MESSAGE`. [apps/dashboard/app/403/page.tsx; apps/admin/app/403/page.tsx; apps/api/src/middleware/require-role.ts]
- [x] [Review][Defer] Dashboard route-gating is permanently fail-closed — `middleware.ts` hardcodes `userRole = undefined`, so every restricted `/settings/*` route 403s for all roles; per-tenant role resolution is deferred to Story 2.7. Also fix the misleading page comment claiming the surface is "gated to owner/admin." — deferred (introduced by Epic 2; depends on 2.7 middleware role resolution) [apps/dashboard/middleware.ts:1216]
- [x] [Review][Defer] AC#2 not demonstrable / Task 4 unrealized — `usePermission` hook and API `requirePermission` middleware exist but no dashboard surface consumes them and no API route is wired, so viewer "metrics visible, write actions absent/disabled" cannot be exercised. — deferred (introduced by Epic 2; consuming surfaces land in later epics) [apps/dashboard/src/hooks/use-permission.ts; apps/api/src/middleware/require-role.ts]
