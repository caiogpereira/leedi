---
baseline_commit: 992b842
---

# Story 5.4: Lead Tags & Opt-out Management

Status: review

## Story

As a tenant operator,
I want to manually tag leads and process opt-out requests,
so that I can organize my lead base and comply with LGPD.

## Acceptance Criteria

1. **Given** an operator is on a lead's detail page and adds a tag (text input, submit), **When** saved, **Then** the tag is inserted in `lead_tags` with `origem_tag: 'manual'`, **And** it appears immediately in the lead's tags list without a page reload.
2. **Given** an operator removes a tag, **When** confirmed, **Then** the `lead_tags` record is deleted and removed from the UI.
3. **Given** an operator clicks "Marcar como optout" and confirms the dialog, **When** executed, **Then** `leads.status` is set to `optout`, **And** a journey event is created `{ tipo: 'optout', detalhes: { origem: 'manual', operador_id: <userId> } }`, **And** the optout warning banner appears on the detail page.
4. **Given** a lead is `optout`, **When** any dispatch targeting query runs, **Then** that lead's phone is excluded from dispatch targets (enforced by the `list-dispatch-targets` use case respecting `status != 'optout'` — verified by unit test, not UI test).
5. **Given** an operator tries to re-activate an opted-out lead by setting status back to `ativo`, **When** saved, **Then** status updates to `ativo` and a journey event `{ tipo: 'reativado', detalhes: { operador_id: <userId> } }` is created.

## Tasks / Subtasks

- [x] Task 1: Tag management use cases + API (AC: #1, #2)
  - [x] `packages/lead/src/use-cases/add-lead-tag.ts` — inserts lead_tags with origemTag: 'manual', returns created row
  - [x] `packages/lead/src/use-cases/remove-lead-tag.ts` — deletes scoped to id + lead_id + tenant_id (defense-in-depth)
  - [x] Exported from `packages/lead/src/index.ts`
  - [x] `POST /:id/tags` (201) and `DELETE /:id/tags/:tagId` (204) added to leads router
- [x] Task 2: Opt-out / reactivate use case + API (AC: #3, #5)
  - [x] `packages/lead/src/use-cases/update-lead-status.ts` — UPDATE status + INSERT journey event in ONE withTenant transaction; returns boolean (false → 404)
  - [x] `PATCH /:id/status` — operadorId from `c.get('userId')` (session), validates status ∈ {optout, ativo}
- [x] Task 3: Tag UI on lead detail page (AC: #1, #2)
  - [x] `lead-detail-client.tsx` ('use client') — optimistic add (temp id reconciled with server row), optimistic remove (prior list captured for rollback)
- [x] Task 4: Status actions on lead detail page (AC: #3, #5)
  - [x] "Marcar como optout" (red) with window.confirm; "Reativar lead" (amber) when status === 'optout'; optout banner reactive to state
- [x] Task 5: Tests (AC: #3, #4, #5)
  - [x] `update-lead-status.test.ts` — same-tx assertion, optout/reativado shapes, no-match → false
  - [x] `list-dispatch-targets.test.ts` — LGPD seam: only 'ativo' leads returned, optout excluded
  - [x] `add-remove-lead-tag.test.ts` — origemTag: 'manual', triple-scoped delete

## Dev Notes

- Files to create: `packages/leads/src/use-cases/add-lead-tag.ts`, `remove-lead-tag.ts`, `update-lead-status.ts`, and (for AC #4) `list-dispatch-targets.ts`.
- Files to modify: `apps/api/src/routes/leads.ts` (add tag + status routes), `packages/leads/src/index.ts` (exports), `apps/dashboard/app/(shell)/leads/[id]/page.tsx` (tag chips + status actions).
- npm dependencies: none new. Confirmation dialog + badges come from `@leedi/ui`.
- Session/user: `operador_id` must come from the authenticated session (the same mechanism `requireTenantSession()` uses to resolve the tenant/user), never trusted from the request body.
- Architecture notes: depends on Story 5.1 (schema + `@leedi/leads`) and 5.2 (detail page + optout banner). `list-dispatch-targets` is the seam that the future dispatch epic will consume; the `status != 'optout'` filter is the LGPD-critical invariant.

### Testing standards

- Unit tests with vitest; mock `withTenant`/transaction or assert the composed statements. The transaction atomicity (status + journey event together) is the key assertion for AC #3/#5.
- No real network. Optional local-Supabase integration test for the transaction.

### Pitfalls to avoid

- Status change + journey event MUST be in ONE transaction — a status flip without its journey event (or vice-versa) is a data-integrity bug.
- `operador_id` comes from the session, NOT the request body (an operator must not be able to spoof another's id).
- Optout is the LGPD compliance boundary — the `status != 'optout'` filter in dispatch targeting is mandatory and must be unit-tested (AC #4 is explicitly verified by test, not UI).
- Tag add/remove must be scoped to both `lead_id` AND `tenant_id` (defense in depth on top of RLS) so a tag id from another lead/tenant cannot be deleted.
- Optimistic UI must roll back on API error (do not leave a phantom tag if the request fails).

### Project Structure Notes

- Tag + status mutations live in `@leedi/leads` via `withTenant`; HTTP in `apps/api`; UI in `apps/dashboard`. The dispatch-targets filter lives in `@leedi/leads` as the shared seam.

### References

- [Source: docs/01-leedi-arquitetura.md#6.3 Schema leads / lead_tags / lead_journey_events]
- [Source: _bmad-output/planning-artifacts/epics.md#Story 5.4: Lead Tags & Opt-out Management]

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6 (fullstack-dev-specialist subagent)

### Debug Log References

_none_

### Completion Notes List

- `updateLeadStatus` returns boolean instead of void to enable 404 detection without a second query
- `list-dispatch-targets` uses `status = 'ativo'` (not `!= 'optout'`) — excludes both optout AND bloqueado, as intended for LGPD safety
- `operadorId` sourced from `c.get('userId')` (session middleware), never from request body
- UUID guard added to tag/status routes to prevent Postgres 500 on malformed IDs

### File List

- `packages/lead/src/use-cases/add-lead-tag.ts` (new)
- `packages/lead/src/use-cases/remove-lead-tag.ts` (new)
- `packages/lead/src/use-cases/update-lead-status.ts` (new)
- `packages/lead/src/use-cases/list-dispatch-targets.ts` (new)
- `packages/lead/src/use-cases/is-uuid.ts` (new — shared UUID guard)
- `packages/lead/src/use-cases/__tests__/update-lead-status.test.ts` (new)
- `packages/lead/src/use-cases/__tests__/list-dispatch-targets.test.ts` (new)
- `packages/lead/src/use-cases/__tests__/add-remove-lead-tag.test.ts` (new)
- `packages/lead/src/index.ts` (modified — added all new exports)
- `apps/api/src/routes/leads.ts` (modified — POST /:id/tags, DELETE /:id/tags/:tagId, PATCH /:id/status)
- `apps/dashboard/app/(shell)/leads/[id]/lead-detail-client.tsx` (new — client component with state)
- `apps/dashboard/app/(shell)/leads/[id]/page.tsx` (modified — now delegates to client component)
- `apps/dashboard/app/api/tenants/[tenantId]/leads/[id]/tags/route.ts` (new — proxy)
- `apps/dashboard/app/api/tenants/[tenantId]/leads/[id]/tags/[tagId]/route.ts` (new — proxy)
- `apps/dashboard/app/api/tenants/[tenantId]/leads/[id]/status/route.ts` (new — proxy)

### Change Log

- 2026-06-01: Story 5-4 implemented — tag management, opt-out/reactivate use cases, interactive detail page, LGPD dispatch-targets seam
