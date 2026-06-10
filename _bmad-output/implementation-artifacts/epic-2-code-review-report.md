# Epic 2 — Code Review Report

- **Epic:** 2 — Multi-Tenant Identity & Access
- **Stories reviewed:** 2.1 → 2.8 (all in `review`)
- **Reviewer:** Claude (Opus 4.8) via `bmad-code-review`
- **Date:** 2026-06-08
- **Communication:** PT-BR (chat) · EN (this document)
- **Method:** single-session, per-story audit (commits are cleanly isolated, see §1).
  Every 2026-06-04 finding was **re-verified against current HEAD**, not the historical
  commit — later epics (3–20) edited the same auth/RLS/schema files, so a finding open on
  the 4th may be fixed or newly broken now.

---

## 1. Scope & method

Unlike Epic 1, Epic 2 has **dedicated per-story commits**, so each story is verifiable:

| Story | Commit | Story | Commit |
|-------|--------|-------|--------|
| 2.1 | `98a93cc` | 2.5 | `e386e07` |
| 2.2 | `dc940de` (+`aa051d8`) | 2.6 | `3bbd59f` (+`c1ff84f`) |
| 2.3 | `23d4adc` | 2.7 | `1c5f33d` |
| 2.4 | `91e40b5` | 2.8 | `98c4d94` |

A prior review (**2026-06-04**) left a "Review Findings" block in all 8 story files with
mostly-open checkboxes. This review **closes that out**: it confirms what later epics already
fixed, re-flags what is still open, identifies a **new live regression**, and routes
[Decision]/cross-cutting items appropriately.

**Two-target rule (Epic 1 lesson):** *read target* = each story's commit diff; *verify/fix
target* = **current working tree (HEAD)**.

---

## 2. Verdict: 🟡 Most 2026-06-04 [Patch] items already fixed by later epics — but one **live bug** and one **coupled RLS-activation gap** remain

The good news, verified at HEAD:

- **2.1** `minPasswordLength: 8` + a `hooks.before` complexity policy now guard the native
  Better-Auth endpoints; `register-user.test.ts` exists. ✅
- **2.2** `session.expiresIn = 30d` and `loginUser` forwards `rememberMe` (unchecked → session
  cookie). ✅
- **2.3** Was already clean. ✅
- **2.6** Email/session binding (`EMAIL_MISMATCH`), role-upgrade re-invite (`onConflictDoUpdate`),
  `try/catch` around `signUpEmail`, `WHERE accepted_at IS NULL` single-use guard, password policy
  on the new-user path, the **DB partial-unique index** (`0016_epic2_invitation_pending_unique.sql`),
  and `accept-invitation.test.ts` all landed. ✅
- **2.7** `switchTenant` now rejects non-`active`/`trial` tenants (`SWITCHABLE_STATUSES`). ✅
- **2.8** `stop-impersonation` now requires a session + cookie-owner match, clears cookies BEFORE
  the audit write, wraps it in `try/catch`; `impersonate` validates the tenantId is a UUID;
  `startImpersonation` verifies the tenant exists **and** belongs to the admin's workspace; the
  1-hour expiry is **re-validated server-side** in `(shell)/layout.tsx` (`expiresAt <= Date.now()`
  → drop to admin context). ✅
- **2.5** 403 pages (dashboard + admin) now pull copy from next-intl; the API RBAC is **wired**
  (`tenant-session.ts` resolves `tenantRole` from membership; `billing.ts`/`usage.ts` use
  `requirePermission`). ✅

What remains is concentrated and important (details in §3):

1. 🔴 **Live bug** — every `/settings/*` page 403s for **all** users (incl. owners).
2. 🟠 **RLS is not actually enforced at runtime** (BYPASSRLS app role) — a coupled
   role-provisioning + policy-hardening workstream.
3. Two product/architecture **[Decision]s** for Caio.
4. A few **cross-cutting / deferred** items.

---

## 3. Findings (current HEAD status)

Legend — **Status**: `FIXED` (resolved at HEAD by a later epic) · `OPEN` · `DECISION` (needs Caio) ·
`DEFER` (cross-epic / infra / needs live harness).

| # | Sev | Story | Finding | 2026-06-04 tag | HEAD status |
|---|-----|-------|---------|----------------|-------------|
| 1 | 🟡 | 2.1 | Registration returns a distinct duplicate-email message (enumeration vector) | [Decision] | **DECISION** — mandated by AC#3 |
| 2 | — | 2.1 | Password policy bypassable via native endpoints | [Patch] | **FIXED** |
| 3 | — | 2.1 | Missing `register-user.test.ts` | [Patch] | **FIXED** |
| 4 | — | 2.2 | `rememberMe` never yields 30-day lifetime | [Patch] | **FIXED** |
| 5 | 🟢 | 2.2 | Missing logout integration test (reused token → 401) | [Patch] | **OPEN** (needs live session store; same class as RLS tests) |
| 6 | 🟠 | 2.4 | AC#2 tenant isolation **unenforced at runtime** — app `DATABASE_URL` is the BYPASSRLS `postgres` role; `withTenant`/`withServiceRole` are no-ops; `rls.test.ts` cross-tenant test fails | [Decision] | **DECISION + DEFER** (Workstream B) |
| 7 | 🟠 | 2.4 | `memberships`/`tenants` policies are all-command, no `WITH CHECK` — the `user_id = app.user_id` SELECT escape hatch also permits **writes** (self-assign `role='owner'` under `withUser`) | [Patch] | **OPEN** (Workstream B; runtime-inert until #6) |
| 8 | 🟠 | 2.4 | `audit_logs` `SELECT USING (true)` + `INSERT WITH CHECK (true)` — world-readable across workspaces; any context can insert arbitrary audit rows | [Patch] | **OPEN** (Workstream B; runtime-inert until #6) |
| 9 | — | 2.5 | 403 message hardcoded, not next-intl | [Patch] | **FIXED** (API keeps a fixed string — acceptable for a service boundary) |
| 10 | 🔴 | 2.5 / 2.7 | **Dashboard route-gating fail-closed is now a LIVE BUG** — `middleware.ts:55` hardcodes `userRole = undefined`; `ROUTE_PERMISSION_MAP` restricts `/settings/*`; real pages now exist (`/settings/team`, `/settings/uso`, `/settings/whatsapp`) → **all users (incl. owner) are redirected to `/403`** | [Defer] | **OPEN — REGRESSION** (Workstream A) |
| 11 | — | 2.5 | API `requirePermission` unwired / AC#2 not demonstrable | [Defer] | **FIXED (API)** / UI side folded into #12 |
| 12 | 🟠 | 2.5 | UI gating (AC#2): `usePermission` hook has **zero consumers**; viewer "write actions absent/disabled" not demonstrable | [Defer] | **OPEN** (Workstream A) |
| 13 | — | 2.6 | accept link-possession-only (no session/email binding) | [Decision] | **FIXED** (binding added) |
| 14 | — | 2.6 | re-invite to higher role silently dropped | [Decision] | **FIXED** (`onConflictDoUpdate` upgrades role) |
| 15 | — | 2.6 | no try/catch + missing `WHERE accepted_at IS NULL` + password policy on new-user path | [Patch] | **FIXED** |
| 16 | — | 2.6 | no DB partial-unique index for pending invites | [Patch] | **FIXED** (`0016_epic2_invitation_pending_unique.sql`) |
| 17 | 🟠 | 2.6 | AC#1 not functional — team page hardcodes `userRole = undefined` → `InviteForm` never renders; members/pending list shows only "empty" | [Defer] | **OPEN** (Workstream A; same root cause as #10) |
| 18 | 🟡 | 2.7 | Active tenant lives in a `leedi_tenant` cookie, not the Better-Auth session — deviates from the documented "session is the single source of truth" | [Decision] | **DECISION** |
| 19 | — | 2.7 | `switchTenant` allows switching into a blocked/cancelled tenant | [Patch] | **FIXED** |
| 20 | 🟠 | 2.8 | AC#2 audit-on-mutation while impersonating **not implemented** — no Hono audit middleware records mutations under impersonation; impersonation context is dashboard-cookie-based and `apps/api` is a separate origin that never sees it | [Defer] | **OPEN** (cross-cutting; see §5) |
| 21 | — | 2.8 | `stop-impersonation` no session auth + fail-open on error | [Patch] | **FIXED** |
| 22 | — | 2.8 | impersonate route doesn't validate UUID | [Patch] | **FIXED** |
| 23 | — | 2.8 | `startImpersonation` doesn't verify target tenant exists / belongs to workspace | [Patch] | **FIXED** |
| 24 | — | 2.8 | 1-hour expiry only via cookie max-age, never server-revalidated | [Patch] | **FIXED** ((shell) layout revalidates `expiresAt`) |
| 25 | 🟢 | 2.8 | no shared `requireWorkspaceAdmin` route guard / no dashboard→admin redirect | [Defer] | **PARTIAL** — `getWorkspaceAdminRole` helper exists & is used; no enforced wrapper/redirect |
| 26 | 🟢 | 2.8 | `getWorkspaceAdmin` ignores `workspaceId`, `.limit(1)` arbitrary → nondeterministic audit attribution if staff spans workspaces | [Defer] | **OPEN** (documented single-workspace assumption; Low) |
| 27 | 🟠 | 2.8 / x | CSRF defense-in-depth — state-changing JSON routes (impersonate/switch/stop) rely solely on `SameSite=Lax`; no CSRF token or Origin/Content-Type assertion | [Defer] | **OPEN** (cross-cutting; see §5) |

---

## 4. Root cause — the spine of what's left

Three sites hardcode `const userRole: TenantRole | undefined = undefined`, each tracing to the
**never-implemented per-tenant role resolution that was Story 2.7's job**:

1. `apps/dashboard/middleware.ts:55` → **live bug #10** (every restricted route 403s).
2. `apps/dashboard/app/(shell)/settings/team/page.tsx:22` → **#17** (invite form never renders).
3. `apps/dashboard/src/hooks/use-permission.ts` exists but **no component consumes it** → **#12**.

The role IS computable today: `(shell)/layout.tsx` already calls
`listUserTenants(userId)` (membership-backed, returns `role` per tenant) and resolves a validated
`currentTenantId`. The fix is to **resolve role from that membership data** (never from the
attacker-controllable cookie/header) and enforce at a real enforcement point.

**Enforcement mechanism (corrected — do NOT enforce in the shared layout):**
a single `(shell)/layout.tsx` is the wrong granularity (it wraps `/settings/billing` [owner],
`/settings/team` [owner/admin] and `/settings/whatsapp` [owner] uniformly) **and** server-component
layouts receive no `pathname`, so `getRequiredRoles(pathname)` cannot run there. Resolve role in the
layout; **enforce per restricted page/segment** via a shared async guard
(`requireTenantPermission(permission)` called at the top of each restricted page, or a per-segment
`layout.tsx`). Reduce the Edge middleware to auth-presence + tenant-header forwarding only (drop the
provably-broken role gate). **#10 and #17 must land together** — fixing the team page alone leaves it
behind the 403 wall.

---

## 5. Correction plan

### Workstream A — Per-tenant role resolution & RBAC enforcement (fix now; closes #10, #12, #17)

1. Add a server-side resolver (dashboard or `@leedi/auth`): given the validated `currentTenantId`
   and the user's memberships, return the caller's `TenantRole` (single source from `listUserTenants`).
2. Add `requireTenantPermission(permission)` — resolves session → `currentTenantId` → role; on
   missing/insufficient role, `redirect('/403')`. Call it at the top of each restricted page:
   `/settings/whatsapp` (owner), `/settings/team` (owner/admin), `/settings/billing` (owner) etc.
3. `middleware.ts`: remove the `userRole = undefined` role gate (keep auth-presence + `x-leedi-tenant-id`
   forwarding). Update the now-false "no /settings/* pages exist yet" comment.
4. `settings/team/page.tsx`: resolve the real role; render `InviteForm` for owner/admin; list members +
   pending invitations ("Pendente").
5. Wire UI gating: consume `usePermission` (or resolve role server-side and pass `can(...)` down) so a
   `viewer` sees no write buttons (AC#2).
6. Re-validate against the stories' ACs (operator → agent-config 403; admin → billing 403; viewer →
   read-only).

### Workstream B — RLS activation (coupled; gated on Caio's infra decision; #6 + #7 + #8)

These are **one** unit, not three patches. They are runtime-inert under the current BYPASSRLS
`postgres` role, and the `memberships` `WITH CHECK` only becomes meaningful — and only risks breaking
writes — once a non-BYPASSRLS role is in use. (Verified safe for current write paths: the owner
membership is created by `acceptInvitation` under `withTenant(tenantId)`, so `WITH CHECK
(tenant_id = app.tenant_id)` passes; `switchTenant` only SELECTs under `withUser`.)

1. **[Decision/infra]** Provision a dedicated non-BYPASSRLS application role (e.g. `leedi_app`) and
   point `DATABASE_URL` at it. This is the same class of deferred infra action as Epic 1's secret
   rotation.
2. Migration (apply **with** step 1, validated by the then-meaningful `rls.test.ts`):
   - split `memberships`/`tenants` into `FOR SELECT` (keep the `user_id`/`tenant_id` read paths) vs a
     write policy with `WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid)`;
   - replace `audit_logs` `SELECT USING (true)` with a service-role/super-admin-scoped read and tighten
     the INSERT `WITH CHECK`.
3. Until step 1 happens, isolation is enforced **only** at the application layer (every use-case goes
   through `withTenant`). Document this runtime limitation on stories 2.4/2.7/2.8.

### Decisions for Caio (surface, do NOT auto-change)

- **#1 — Registration enumeration:** the distinct duplicate-email message is **required by Story 2.1
  AC#3** (explicit product copy) yet contradicts the generic anti-enumeration responses in 2.2/2.3.
  Keep the spec'd message, or override AC#3 for a generic one? (Recommendation: keep — it's an
  intentional, scoped UX trade-off; do not extend it to login/reset.)
- **#6 — BYPASSRLS app role:** see Workstream B. Gate Epic-2 acceptance on provisioning the role, or
  accept 2.4/2.7/2.8 with a documented runtime limitation (mirrors Epic 1's deferral)?
- **#18 — Active tenant in cookie vs session:** accept the membership-checked cookie approach and
  update the architecture note, or refactor to session-backed `current_tenant_id`?

### Cross-cutting / deferred (registered in `deferred-work.md`)

- **#20 — Impersonation audit-on-mutation (AC#2):** unmet. Impersonation context is dashboard-cookie
  state; mutating routes live in `apps/api` (a separate origin) that never receives it. Needs a
  cross-app design (propagate impersonation into the API session + a Hono audit middleware). Story 2.8
  **cannot honestly be `done`** until AC#2 is met or explicitly re-scoped.
- **#27 — CSRF defense-in-depth** (cross-cutting): add an Origin/`Content-Type: application/json`
  assertion (and/or CSRF token) to custom state-changing routes.
- **#26 — `getWorkspaceAdmin` workspace scoping** (Low): guard the single-workspace assumption.
- **#5 — logout integration test** (Low): add when a live session-store harness exists.

---

## 6. Status-integrity finding (process)

All 8 story files say `Status: done` while `sprint-status.yaml` says `review`, and the 2026-06-04
findings were left open. Per the team workflow (never skip to `done`), **"done with open findings" is
itself the inconsistency.** This report does **not** flip any status. After Caio accepts the report and
Workstream A lands, stories 2.1–2.3, 2.5, 2.6, 2.8 can move `review → done`; 2.4/2.7 stay open pending
the Workstream B decision; 2.8 stays open pending the AC#2 decision (#20).

---

## 7. Corrections applied this session

Decisions taken by Caio (2026-06-08): **A** = apply now · **B** = defer (documented) · **#1** = keep
AC#3 message · **#18** = accept cookie model + update architecture note.

### Workstream A — role resolution & RBAC enforcement (live bug #10, #12, #17)

| File(s) | Change |
|---------|--------|
| `apps/dashboard/lib/tenant-context.ts` (new) | `getCurrentTenantContext()` (membership-backed role via `listUserTenants`) + `requireTenantRouteAccess(route)` (per-page RBAC, `ROUTE_PERMISSION_MAP` as SoT, redirects to `/403`) |
| `apps/dashboard/middleware.ts` | Removed the broken `userRole = undefined` Edge role gate; kept auth-presence + `x-leedi-tenant-id` forwarding; updated the now-false comment |
| `apps/dashboard/app/(shell)/settings/team/page.tsx` | Enforce via `requireTenantRouteAccess('/settings/team')`; render `InviteForm` for owner/admin |
| `apps/dashboard/app/(shell)/settings/team/actions.ts` (new) | `inviteAction` server action — resolves tenant+role server-side, calls `inviteMember` (tenantId/role never trusted from the form) |
| `apps/dashboard/app/(shell)/settings/team/invite-form.tsx` | Wired to `inviteAction` via `useActionState`; enabled submit; success/error feedback |
| `apps/dashboard/app/(shell)/settings/whatsapp/page.tsx` | Enforce via `requireTenantRouteAccess('/settings/whatsapp')` (owner-only); de-duplicated inline role resolution |
| `apps/dashboard/app/(shell)/settings/uso/page.tsx` | Enforce via `requireTenantRouteAccess('/settings/uso')` (owner/admin); restores access control the middleware removal would otherwise drop |
| `apps/dashboard/messages/pt-BR.json` | Added `team.inviteSent` |
| `apps/dashboard/tsconfig.json` | Added `lib` to `include` (helper lives outside `src/` to satisfy the Epic 1 relative-import guard) |

### Bonus — stale Epic 2 test repaired (Epic 1 "Finding 7" pattern)

| File(s) | Change |
|---------|--------|
| `packages/auth/src/use-cases/start-impersonation.test.ts` | `@leedi/db` mock was missing `withServiceRole`/`eq`/`schema.tenants` after the 2.8 tenant-existence patch → suite was **RED (2 failing)**. Repaired the mock + added 2 tests (reject nonexistent / foreign-workspace tenant). |

### #18 — architecture note

| File(s) | Change |
|---------|--------|
| `docs/01-leedi-arquitetura.md` (§5.2) | Documented the accepted active-tenant cookie model (membership-revalidated; Edge forwards only) |

### Documentation

| File(s) | Change |
|---------|--------|
| `2-1…`→`2-8…md` | Added a "Code Review Follow-up (2026-06-08)" section per story (HEAD status + this session's fixes) |
| `deferred-work.md` | Reconciled the 2026-06-04 Epic 2 section (marked resolved items) + added a 2026-06-08 section (later-epic typecheck debt for epics 6/12/18; Workstream B; remaining Epic 2 ACs) |

**Verification after corrections:**

- `@leedi/dashboard` typecheck: my changed files are **clean**; the only errors are 4 **pre-existing**
  later-epic issues (Epic 6 `ArgumentList`/`@/` alias, Epic 12 `templates/new` `libraryId`, Epic 18
  `push-registration`) — registered in `deferred-work.md`, not Epic 2 defects.
- ESLint on all changed files: **clean** (exit 0).
- `@leedi/auth` tests: **57/57** green (was 53/55 RED). `@leedi/tenancy` tests: **27/27** green.

## 8. Status & what still blocks `review → done`

**Moved `review → done`:** 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7 (7 of 8).

- **2.6** — pending/member listing implemented (`listTenantMembers` / `listPendingInvitations` + tests;
  team page "Pendente"). AC#1 ✅ / AC#3 ✅; AC#2 accept→`/login` is correct under email verification
  (auto-session = Epic 19).
- **2.4** — RLS net **built + applied** (migration `0018`, `leedi_app` role, dual-connection `appDb`).
  Cutover hit a Supabase infra blocker (shared pooler rejects custom roles); **Caio accepted the
  app-layer-only limitation** (like Epic 1's BYPASSRLS deferral). `APP_DATABASE_URL` stays unset →
  isolation enforced at the app layer; DB-level RLS dormant and ready. See §9.

- **2.8** — closed: AC#2 **implemented** (Option B), impersonation-aware `requireTenantSession` + audit
  on every mutating request (fail-closed; every mutating route verified behind the guard); 10 unit tests
  on the auth decision; route tests 23/23. Empirical first-use exercise batched into the Supabase
  Pro/staging milestone (§ below / `deferred-work.md`).

**Epic 2: all 8 stories `done` → `epic-2: done`.**

**Acceptance follow-ups batched into the Supabase Pro / staging milestone** (code-complete, just need a
deployed-env validation pass — see `deferred-work.md`): (1) 2.4 — activate DB-level RLS via a Dedicated
Pooler connection for `leedi_app` + run `rls.test.ts`; (2) 2.8 — exercise the impersonation write+audit
flow as a super-admin. Both are acceptance, not correction.

Out of scope (registered in `deferred-work.md`): later-epic typecheck debt (epics 6/12/18) — triage in
those epics' reviews.

## 9. Closure plan for 2.4 and 2.8 (decisions for Caio)

### 2.8 — audit-on-mutation: Option B BUILT (Caio's call, 2026-06-08)

Chosen because Exponensia does hands-on client setup/integration (WhatsApp, Hotmart, agent), which
needs super-admin **write** access while impersonating — not just read-only support.

Implemented:
- `apps/api/src/middleware/impersonation.ts` — `resolveImpersonation` (10 unit tests): authorizes only
  when `leedi_impersonating === route tenantId`, `leedi_real_user_id === session user`, expiry valid,
  caller is `super_admin`, and the tenant ∈ the admin's workspace (mirrors `startImpersonation`).
- `apps/api/src/middleware/tenant-session.ts` — impersonation branch grants owner-level access WITHOUT a
  membership and writes an `audit_logs` row (actor = real super-admin, target = tenant) for **every**
  mutating method, **fail-closed** (failed audit → request rejected). Normal membership path unchanged
  (route tests still 23/23). `apps/api` is the universal chokepoint (all `/api/tenants/*` use
  `requireTenantSession`; dashboard proxies forward cookies).

**Pending (Caio):** validate the impersonated write+audit flow in **staging** — privilege-sensitive,
not runtime-testable here. **Known gap:** mutations via direct dashboard server actions (not the
`/api/tenants/*` proxies) are outside this API-layer audit; the integration surfaces in scope go through
the proxies and are covered.

### 2.4 — Workstream B (RLS activation) — DONE with accepted limitation (2026-06-09)

**Outcome:** code shipped (dual-connection `appDb`, optional `APP_DATABASE_URL`), role `leedi_app`
provisioned, migration `0018_epic2_rls_hardening.sql` **applied** + policies/grants verified. Cutover
revealed a **Supabase infra blocker**: the shared pooler (Supavisor) only authenticates `postgres`, so
`leedi_app` can't connect through it (`ENOTFOUND tenant/user leedi_app.<ref>`). Custom-role connections
need a **Dedicated Pooler** (paid) or a **direct connection** (IPv6/IPv4-add-on, no pooling). **Caio
accepted the app-layer-only limitation** — `APP_DATABASE_URL` unset, isolation via `withTenant`; the RLS
net is dormant and ready. Future activation = set `APP_DATABASE_URL` + run `rls.test.ts` + validate in
staging (no code changes). The original runbook is kept below for that future activation.

---

`withServiceRole` runs `SET LOCAL row_security = off`, which **requires BYPASSRLS**. The app currently
connects as Supabase `postgres` (rolbypassrls=true), so RLS is bypassed everywhere. Enforcing it is a
whole-app infra change, not an Epic-2 code tweak:

1. **(Caio, manual)** In Supabase SQL: `CREATE ROLE leedi_app LOGIN PASSWORD '…' NOBYPASSRLS;` then
   grant it `USAGE` on schema + `SELECT/INSERT/UPDATE/DELETE` on the app tables (and `USAGE` on
   sequences). It must **not** be a superuser and **not** have BYPASSRLS.
2. **(Caio, manual)** Add a second secret — e.g. keep `DATABASE_URL` for the privileged/service path
   and add `APP_DATABASE_URL` pointing at `leedi_app` (via the Supabase pooler).
3. **(Claude, code)** Redesign `packages/db/src/client.ts`: two connections — the **app** connection
   (`leedi_app`) used by `withTenant`/`withUser`, and a **service** connection (BYPASSRLS / `service_role`)
   used by `withServiceRole` (drop `SET row_security = off`; the bypass comes from the role).
4. **(Claude, code)** Migration: split `memberships`/`tenants` SELECT vs write with
   `WITH CHECK (tenant_id = app.tenant_id)`; replace `audit_logs` `SELECT USING (true)` with a
   service-scoped read + tighter INSERT `WITH CHECK`.
5. **(Claude, validate)** Point `rls.test.ts` at `leedi_app` and confirm cross-tenant isolation
   (previously failing) now passes — apply the migration **with** the role flip, never standalone.

Steps 3–5 are ready to implement once steps 1–2 are done; until then RLS is enforced **only at the
application layer** (every use-case goes through `withTenant`).
