# Story 2.7: Multi-Tenant Switching

Status: ready-for-dev

## Story

As a user belonging to multiple tenants,
I want to switch between my tenants from the app header,
so that I can manage each client's setup without logging out.

## Acceptance Criteria

1. **Given** a user belongs to two or more tenants, **When** they click the tenant switcher in the dashboard header, **Then** a dropdown lists all their tenants with their role in each.
2. **Given** a user selects a different tenant, **When** the switch is confirmed, **Then** the session context updates to the selected tenant **And** the page re-renders with that tenant's data only.

## Tasks / Subtasks

- [ ] Task 1: List-user-tenants use-case (AC: #1)
  - [ ] Create `packages/tenancy/src/use-cases/list-user-tenants.ts` returning the caller's tenants with `{ tenant_id, name, logo_url, role }` from `memberships` joined to `tenants`
  - [ ] Scope strictly to the authenticated `user_id`; never return tenants the user has no membership in
  - [ ] Use the membership-by-user read path from Story 2.4 (`withUser` / `app.user_id`), NOT the tenant-scoped path — at this point no tenant is selected, so the `app.tenant_id` policy would return zero rows
- [ ] Task 2: Switch-tenant use-case (AC: #2)
  - [ ] Create `packages/tenancy/src/use-cases/switch-tenant.ts`: verify the user has an active membership in the target tenant, then update the session's `current_tenant_id`
  - [ ] Reject (403) if the user has no membership in the requested tenant — do not trust the client-supplied tenant id
  - [ ] Update Better-Auth session (e.g. `session.switchOrganization(tenantId)` or a custom session-update path)
- [ ] Task 3: Tenant switcher component (AC: #1, #2)
  - [ ] Create `apps/dashboard/components/TenantSwitcher.tsx` in the dashboard header
  - [ ] Render tenant name + logo + the user's role per tenant; show a loading spinner during switch
  - [ ] If the user belongs to only one tenant: hide the switcher entirely (no dropdown)
  - [ ] On selection: call the switch route, then redirect to `/dashboard` so server components re-fetch with the new context
- [ ] Task 4: Ensure downstream data re-scopes (AC: #2)
  - [ ] After switching, `withTenant` (Story 2.4) uses the new `current_tenant_id`, so all queries return only the new tenant's rows
  - [ ] Re-resolve the user's RBAC role for the new tenant (Story 2.5) — role can differ per tenant
  - [ ] Invalidate any per-tenant client caches (React Query / router cache) on switch
- [ ] Task 5: Tests (AC: #1, #2)
  - [ ] Unit test list-user-tenants returns only the caller's memberships with correct roles
  - [ ] Unit test switch-tenant rejects a tenant the user is not a member of (403)
  - [ ] Integration test: after switch, queries return the new tenant's data and zero rows from the previous tenant (RLS)
  - [ ] Playwright E2E: multi-tenant user switches tenant -> header + dashboard data update; single-tenant user sees no switcher

## Dev Notes

- Files to create/modify: `packages/tenancy/src/use-cases/list-user-tenants.ts`, `packages/tenancy/src/use-cases/switch-tenant.ts`, `packages/tenancy/src/index.ts` (export), `apps/dashboard/components/TenantSwitcher.tsx`, the dashboard header layout.
- npm dependencies: none new (`better-auth`, `next-intl`, shadcn/ui dropdown).
- Architecture pattern: the session is the single source of truth for `current_tenant_id`; the switch use-case is the only writer. After switch, redirect so RSC re-render picks up the new context rather than patching client state.
- Role re-resolution: after a switch, RBAC (Story 2.5) and any cached role MUST be recomputed for the new tenant.

### Security considerations

- Server-side membership check is mandatory: never switch to a tenant id the user lacks a membership in. The client list is convenience only; the switch endpoint re-verifies.
- After switching, confirm RLS context (`app.tenant_id`) follows the new tenant so prior-tenant data cannot bleed through cached queries.
- Clear/invalidate client-side caches keyed by the old tenant to avoid showing stale cross-tenant data.

### Testing standards

- Unit tests in `packages/tenancy/src/use-cases/*.test.ts` (Vitest).
- Integration test must confirm post-switch RLS isolation (new tenant only, previous tenant zero rows).

### Pitfalls to avoid

- Do NOT trust the client-supplied tenant id without a membership re-check (privilege bypass).
- Do NOT forget to re-resolve the RBAC role for the new tenant — a user may be owner in A and viewer in B.
- Do NOT leave stale React Query / router caches from the previous tenant after switching.
- Do NOT render the switcher for single-tenant users.

### Project Structure Notes

- Switching logic in `packages/tenancy`; UI component in `apps/dashboard`.
- Relies on `withTenant` and the session `current_tenant_id` from Story 2.4.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 2.7: Multi-Tenant Switching]
- [Source: _bmad-output/planning-artifacts/epics.md#Epic 2: Multi-Tenant Identity & Access] (FR5)
- [Source: docs/01-leedi-arquitetura.md#6.1 Schema do banco]

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

### Completion Notes List

### File List
