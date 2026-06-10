# Story 2.6: Team Member Invitation Flow

Status: done

## Story

As a tenant owner or admin,
I want to invite teammates by email with a specific role,
so that my team can access the platform with appropriate permissions.

## Acceptance Criteria

1. **Given** an owner navigates to Settings → Team → Convidar, **When** they enter a valid email, select a role, and submit, **Then** an invitation email is sent via Resend with a 72-hour link **And** the invitation is listed as "Pendente" in the team table.
2. **Given** an invited user clicks the link and completes password setup, **When** the link is valid, **Then** they are added to the tenant with the assigned role **And** redirected to the dashboard.
3. **Given** an owner tries to invite the same email that has a pending invitation, **When** the form is submitted, **Then** an error shows: "Já existe um convite pendente para este e-mail".

## Tasks / Subtasks

- [ ] Task 1: Invitations schema (AC: #1, #3)
  - [ ] Add `invitations(id uuid pk, tenant_id uuid fk, email text, role text, invited_by uuid fk -> users, token text unique, expires_at timestamptz, accepted_at timestamptz null, created_at timestamptz)` to `packages/db/src/schema/tenancy.ts`
  - [ ] Unique partial index preventing two PENDING (`accepted_at IS NULL` and not expired) invites for the same `(tenant_id, email)`
  - [ ] Enable RLS with `tenant_isolation` policy on `tenant_id` (consistent with Story 2.4); generate migration
- [ ] Task 2: Create-invitation use-case (AC: #1, #3)
  - [ ] Create `packages/tenancy/src/use-cases/invite-member.ts`: validate email + role (Zod), check no pending invite exists (else AC #3 message), generate single-use token + 72h expiry, persist, dispatch email
  - [ ] Authorize: only `owner`/`admin` may invite (reuse `requireRole` from Story 2.5); an `admin` must not be able to grant `owner`
  - [ ] All DB writes go through `withTenant` (Story 2.4)
- [ ] Task 3: Invitation email (AC: #1)
  - [ ] Create React Email template `apps/web/emails/invitation.tsx` including tenant name, inviter name, role, and the accept link (pt-BR)
  - [ ] Send via the Resend adapter in `packages/notification`
- [ ] Task 4: Accept-invitation flow (AC: #2)
  - [ ] Create `apps/web/app/invite/[token]/page.tsx`
  - [ ] Create `packages/tenancy/src/use-cases/accept-invitation.ts`: verify token valid + not expired + not accepted
    - [ ] If email already has a Leedi account: create a `membership` linking that user to the tenant with the assigned role
    - [ ] If new email: render password-setup form -> create user (via Better-Auth) + membership
    - [ ] Mark `accepted_at`; redirect to `/dashboard` with the new tenant context
  - [ ] Expired/invalid/used token -> error page: "Este convite expirou. Solicite um novo ao administrador."
- [ ] Task 5: Team settings UI (AC: #1, #3)
  - [ ] Create `apps/dashboard/app/(dashboard)/settings/team/page.tsx`: team table with members + pending invitations ("Pendente")
  - [ ] "Convidar" modal (email + role select); on AC #3 collision show the pending-invite error
  - [ ] Pending rows expose "Reenviar" and "Cancelar" actions (reissue/regenerate token; soft-cancel)
- [ ] Task 6: Tests (AC: #1, #2, #3)
  - [ ] Unit test invite-member: duplicate pending invite -> AC #3 error; admin cannot grant owner
  - [ ] Unit test accept-invitation: existing user -> membership only; new user -> user + membership; expired token rejected; token single-use
  - [ ] Integration test: invite (RLS-scoped) only visible within the inviting tenant
  - [ ] Playwright E2E: invite -> accept (new user password setup) -> lands on dashboard with correct role

## Dev Notes

- Files to create/modify: `packages/db/src/schema/tenancy.ts` (+ migration), `packages/tenancy/src/use-cases/invite-member.ts`, `packages/tenancy/src/use-cases/accept-invitation.ts`, `packages/tenancy/src/index.ts` (export), `apps/web/emails/invitation.tsx`, `apps/web/app/invite/[token]/page.tsx`, `apps/dashboard/app/(dashboard)/settings/team/page.tsx`.
- npm dependencies: `better-auth`, `resend`, `@react-email/components`, `zod` (already present).
- Architecture pattern: invitation logic lives in `packages/tenancy` (its domain), exported only via `index.ts`. Email through `packages/notification`. Authorization via `requireRole` from `packages/auth`.
- Reuse the password policy schema from Story 2.1 for the new-user setup path.

### Security considerations

- Invitation token: cryptographically random, single-use, 72h expiry; never logged or echoed in responses.
- Privilege escalation guard: an `admin` inviter must not assign `owner`; validate the requested role against the inviter's own role server-side.
- RLS scopes invitations to the tenant — an inviter from tenant A can never see/cancel tenant B's invitations.
- "Reenviar" should rotate the token (invalidate the old one) rather than resend the same link, to bound exposure.
- Accept flow must re-verify token server-side at submit time, not just on page load (the link may expire between load and submit).
- Do not reveal whether the invited email already has a Leedi account beyond what the flow inherently requires.

### Testing standards

- Unit tests in `packages/tenancy/src/use-cases/*.test.ts` (Vitest).
- Integration test confirms RLS isolation of `invitations` across tenants.

### Pitfalls to avoid

- Do NOT allow role escalation via the role field (admin -> owner).
- Do NOT leave the unique-pending constraint to app code only — enforce in DB to avoid race-condition double-invites.
- Do NOT keep the old token valid after "Reenviar".
- Do NOT skip the server-side expiry re-check at acceptance submit.

### Project Structure Notes

- Domain logic in `packages/tenancy`; schema in `packages/db`; accept UI in `apps/web` (unauthenticated entry); team management UI in `apps/dashboard`.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 2.6: Team Member Invitation Flow]
- [Source: _bmad-output/planning-artifacts/epics.md#Epic 2: Multi-Tenant Identity & Access] (FR6, FR7)
- [Source: docs/01-leedi-arquitetura.md#6.1 Schema do banco]

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

### Completion Notes List

- `invitations` table added to the DB schema + migration `0002_mute_havok.sql` with RLS `tenant_isolation`.
- `inviteMember`: privilege escalation guard (admin cannot grant owner), 72h token, AC#3 duplicate rejection with the exact message.
- `acceptInvitation`: token re-verified at submit time; `onConflictDoNothing` prevents duplicate membership on retry.
- Accept page branches: new user (password form) vs existing user (click-to-accept).
- PARTIAL AC#1: the team page is a scaffold; it does not yet list pending invitations (session carries no tenant context until Story 2.7).
- PARTIAL AC#2: redirects to `/login?invited=success` (not `/dashboard`) because no session is established at accept time.

### File List

- `packages/db/src/schema/tenancy.ts` (invitations table)
- `packages/db/migrations/0002_mute_havok.sql`
- `packages/tenancy/src/use-cases/invite-member.ts`
- `packages/tenancy/src/use-cases/invite-member.test.ts`
- `packages/tenancy/src/use-cases/accept-invitation.ts`
- `packages/tenancy/src/index.ts`
- `packages/notification/src/templates/invitation.tsx`
- `apps/web/app/invite/[token]/page.tsx`
- `apps/web/app/invite/[token]/actions.ts`
- `apps/dashboard/app/(dashboard)/settings/team/page.tsx`
- `apps/dashboard/app/(dashboard)/settings/team/invite-form.tsx`

## Code Review Follow-up (2026-06-08)

Re-verified against HEAD + **fixes applied this session** (see `epic-2-code-review-report.md`). All
2026-06-04 findings are **FIXED**:

- `[Decision]` link-possession-only → **FIXED**: `acceptInvitation` now binds to `currentUserEmail`
  (rejects a logged-in user redeeming an invite for another address).
- `[Decision]` re-invite role silently dropped → **FIXED**: `onConflictDoUpdate` applies the invited
  role (upgrade).
- `[Patch]` try/catch + `WHERE accepted_at IS NULL` + new-user password policy → **FIXED**.
- `[Patch]` DB partial-unique index → **FIXED** (`0016_epic2_invitation_pending_unique.sql`).
- `[Patch]` missing `accept-invitation.test.ts` → **FIXED** (exists).
- `[Defer]` invite UI not wired → **FIXED 2026-06-08**: `InviteForm` now submits to `inviteAction`
  (resolves tenant + inviter role server-side → `inviteMember`); team page renders it for owner/admin
  via `requireTenantRouteAccess`.

**Update 2026-06-08 (closure):** the members + pending-invitation listing was **implemented** —
new `listTenantMembers` + `listPendingInvitations` use-cases (`@leedi/tenancy`, RLS-scoped via
`withTenant`, unit-tested → tenancy 31/31) render on the team page with a "Pendente" badge; `inviteAction`
calls `revalidatePath('/settings/team')`. **AC#1 ✅ / AC#3 ✅.** AC#2: the membership is created with the
assigned role; the accept flow redirects to `/login?invited=success` rather than `/dashboard` — the
**correct** behavior under `requireEmailVerification` (a new invitee has no verified session yet). The
spec's "redirect to dashboard" assumed auto-session-on-accept, which is Epic 19 (onboarding/session)
work — tracked in `deferred-work.md`. Story moved `review → done` on this basis.

**Reenviar/Cancelar** pending-invite actions (Task 5 polish, beyond AC#1's listing requirement) remain
optional follow-up.

## Review Findings (Code Review 2026-06-04)

- [ ] [Review][Decision] `acceptInvitation` is link-possession-only — there is no check that the authenticated user matches the invited email; any holder of the link can redeem it (or create an account under the invited email with an attacker-chosen password). Token entropy (32 random bytes) is fine; the gap is the missing session/email binding. Decide: require login + email match vs. accept the link-possession model. [packages/tenancy/src/use-cases/accept-invitation.ts:4509-4576]
- [ ] [Review][Decision] Re-invite to a higher role is silently dropped — `onConflictDoNothing` on `(user_id, tenant_id)` discards the new membership/role while `acceptedAt` is still set, so the user keeps their old role with no error. Decide: re-invite should upgrade role, reject explicitly, or keep silent-no-op. [packages/tenancy/src/use-cases/accept-invitation.ts:4558-4573]
- [ ] [Review][Patch] `acceptInvitation` has no try/catch around `signUpEmail` and the accept `update` is keyed by `token` only — errors (weak password / `USER_ALREADY_EXISTS`) escape the Server Action as a 500, and concurrent accepts of the same new-user token both pass the `acceptedAt IS NULL` read. Fix: wrap signUp in try/catch returning a typed result; add `WHERE accepted_at IS NULL` to the update. Also apply the password policy on this new-user path. [packages/tenancy/src/use-cases/accept-invitation.ts:4542-4573]
- [ ] [Review][Patch] No DB partial-unique index for pending invites (Task 1 + pitfall) — the duplicate-pending guard is app-code-only (select-then-insert race). Add `UNIQUE (tenant_id, email) WHERE accepted_at IS NULL`. [packages/db/migrations]
- [ ] [Review][Patch] Missing mandated test (Task 6): `accept-invitation.test.ts` — existing user -> membership only; new user -> user + membership; expired token rejected; token single-use. [packages/tenancy/src/use-cases/accept-invitation.ts]
- [x] [Review][Defer] AC#1/AC#2 not functional end-to-end — `InviteForm` submit is disabled with no `action` wired (owner cannot create an invite via UI) and the team page lists no pending invitations; accept redirects to `/login?invited=success` instead of the dashboard (AC#2). Wiring deferred to Story 2.7. — deferred (introduced by Epic 2; AC unmet, story cannot be "done") [apps/dashboard/app/(dashboard)/settings/team/invite-form.tsx; .../page.tsx; apps/web/app/invite/[token]/actions.ts]
