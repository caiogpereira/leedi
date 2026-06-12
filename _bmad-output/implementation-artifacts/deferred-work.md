
> **📋 Launch checklist:** the curated, priority-ranked view of everything below (P0/P1/P2,
> indexed per epic) lives in **`pendencias-pre-launch.md`** — that is the pre-production gate.
> This file remains the detailed debt tracker.

## Deferred from: code review of Epic 3 (2026-06-09)

> Source: `epic-3-code-review-report.md`. The component/unit layer of Epic 3 is complete and
> green (ui 28 · dashboard 65 · admin 18 · api-AI 4). These are the items that are **not** done.

- **[Epic-3 debt] Project E2E / a11y harness — Phase 1 & Phase 2 specs BUILT & green locally (2026-06-09).**
  Originally absent (no `@playwright/test` dep, no config, no `test:e2e`, no `@axe-core/playwright`). Caio
  chose to build it (Option A). **Phase 1 done & verified — 8/8 unauthenticated tests gate today:** deps
  installed (browsers on `D:\ms-playwright` via `PLAYWRIGHT_BROWSERS_PATH`), `playwright.config.ts` +
  `test:e2e` in both apps, real unauthenticated specs — dashboard guard 5/5 (`/`,`/leads`,`/agente`,
  `/settings/team` → 307 `/login`; `/api/health` public), admin guard 3/3 (`/`,`/tenants` → `/login`) **+
  axe sweep on `/403`**. Added the missing `apps/dashboard/app/api/health/route.ts` and pinned
  `outputFileTracingRoot` in both `next.config.ts`.
  **Phase 2 done & verified locally (run with `E2E_AUTH=1`):** authenticated coverage via a server-minted
  Better-Auth session (`auth.api.signInEmail` → Playwright `storageState`; the session cookie is HMAC-signed,
  so it can't be rebuilt from the DB row). Each app has `e2e/global-setup.ts` + `e2e/seed/*` that idempotently
  pre-clean and seed a FIXED-uuid `[E2E]` namespace (dashboard: workspace+tenant+owner `e2e+owner@leedi.test`,
  tenant seeded `active` to skip the onboarding redirect; admin: workspace+super_admin `e2e+superadmin@leedi.test`
  via `workspace_admins`), then scoped-delete by id (never a global wipe). Configs split into a `public` project
  (no storageState — keeps the anonymous guard assertions honest) and an `auth` project (storageState, runs only
  under `E2E_AUTH`). **Green:** dashboard auth 13/13 — smoke + 3.1 (theme persist/FOUC/active-route/mobile drawer)
  + 3.3 (modal stream→accept) + 3.4 (skip-link, keyboard, axe sweep on `/`,`/leads`,`/settings/team` with zero
  serious/critical); admin auth 3/3 — 3.2 (5-item sidebar, active route, ADMIN indicator). **NOTE on 3.3:** it
  mocks BOTH transports (the agent-config GET and `/api/ai/improve-text` POST) — it is a component-behaviour test
  of the streaming→accept UI, NOT an integration test of the AI route. `apps/admin/package.json` gained
  `@leedi/db` (needed by the admin seed) — commit the `pnpm-lock.yaml` delta with it. `whatsapp-connect.spec.ts`
  (Story 4.2, needs the API server) parked in `apps/dashboard/e2e/wip/`, out of Phase 2 scope.
  **Phase 2 REMAINING (NOT verified — needs the maintainer):** (a) the nightly CI job is scaffolded at
  `.github/workflows/e2e-nightly.yml` but **dispatch-only with the `schedule:` commented out** — it runs the
  authed suites against a REAL Supabase, so it needs `E2E_DATABASE_URL`/`E2E_BETTER_AUTH_SECRET` secrets and is
  gated to no-op until they exist; enabling the nightly is an outward-facing decision (prefer a dedicated E2E
  Supabase project — see below). (b) Migrate to a separate Supabase project before the first real customer.
  (c) CI runners are slower than local + `reuseExistingServer` is off there, so the 120s per-test timeout may
  need raising once the job actually runs.
  **Env note:** C: is chronically low on space (was 0.29 GB; Next dev ENOSPC'd) — keep clear or move dev
  caches / pnpm store to D: (376 GB free).
- **[Epic-3 / Story 3.4] axe-in-CI gate — RESOLVED to `done` with documented caveat (2026-06-09).**
  Phase 2 added the full internal-page axe sweep (`/`,`/leads`,`/settings/team`, zero serious/critical) +
  keyboard E2E, all green locally. The remaining piece — the *CI-enforced* gate (the nightly job) — is
  scaffolded but not wired. **Caio's decision (2026-06-09): accept local-green as sufficient for now; 3.4 →
  `done`** and the CI enforcement + dedicated E2E Supabase move to the pre-launch checklist as **PL-9** (and
  **PL-4**) in `pendencias-pre-launch.md`. The gate is NOT silently dropped — it is an explicit launch gate.
- **[Epic-3, doc only] `baseline_commit` invalidated.** All four Epic 3 stories carry
  `baseline_commit: 992b8421…`, a dangling object after the git-history secret purge (commit `460a15c`);
  it no longer resolves, so commit-diff review was impossible (an implementation-vs-spec audit was done
  instead). Not fabricating a replacement hash. If diff-review of these stories is ever needed, set a
  valid pre-Epic-3 baseline manually.
- **[Story 3.3 → Epic-1 debt, reference only]** the AI route test (`ai-improve-text.test.ts`, 4/4 local)
  lives in `@leedi/api`, which the CI test gate **excludes** (`turbo run test --filter='!@leedi/api'`).
  Tracked under Epic-1's `epic-1-test-ci-backlog.md` (api cross-file test-state pollution) — **not**
  re-filed here.

---

## Deferred from: code review of Epic 2 (2026-06-04) — reconciled 2026-06-08

> Note: all items below were introduced by Epic 2 (not pre-existing). Statuses
> reconciled against HEAD during the 2026-06-08 Epic 2 code review
> (`epic-2-code-review-report.md`).

- ~~**[2.5/2.7] Dashboard route-gating fail-closed**~~ — **RESOLVED 2026-06-08.** This had
  become a **live bug** (real `/settings/{team,uso,whatsapp}` pages 403'd for every user incl.
  owners). Per-tenant role resolution now lives in `apps/dashboard/lib/tenant-context.ts`
  (`requireTenantRouteAccess`), enforced per restricted page; the broken Edge role gate was removed.
- ~~**[2.5] RBAC surfaces unwired**~~ — **RESOLVED.** API side wired by later epics
  (`apps/api/src/middleware/tenant-session.ts` sets `tenantRole`; `billing.ts`/`usage.ts` use
  `requirePermission`). Dashboard side now gates server-side per page (team invite form, whatsapp
  connect form). The `usePermission` client hook remains available for client-component gating.
- ~~**[2.6] Invitation UI not wired**~~ — **RESOLVED 2026-06-08** (AC#1 invite path). `InviteForm`
  now submits to `inviteAction` (resolves tenant+role server-side → `inviteMember`); team page renders
  it for owner/admin. **Remaining (registered below):** members + pending-invitation listing
  ("Pendente") needs a `list-memberships`/`list-pending-invitations` use-case; accept-flow auto-session
  (AC#2) still redirects to `/login` (Epic 19 onboarding/session work).
- **[2.8] Audit-on-mutation not implemented (AC#2)** — **STILL OPEN.** See the 2026-06-08 section
  below — impersonation context is dashboard-cookie state; `apps/api` is a separate origin that never
  receives it. Needs a cross-app design. Story 2.8 cannot be `done` until met or re-scoped.
- **[2.8] No shared `requireWorkspaceAdmin` helper / dashboard→admin redirect (Task 1)** — **PARTIAL.**
  `getWorkspaceAdminRole` helper exists and is used (`(shell)/layout.tsx`); an enforced route-guard
  wrapper + the dashboard→admin redirect were not extracted. Low.
- **[2.8] `getWorkspaceAdmin` workspace scoping** — **STILL OPEN.** `.limit(1)` with no `workspaceId`
  filter; nondeterministic audit attribution if staff spans multiple workspaces. Low (single-workspace
  MVP, documented in `workspace-guard.ts`).
- **[Cross-cutting] CSRF defense-in-depth** — **STILL OPEN.** Custom state-changing JSON routes
  (impersonate/switch/stop) rely solely on `SameSite=Lax`; no CSRF token / Origin / `Content-Type`
  assertion.

---

## Deferred from: code review of Epic 2 (2026-06-08)

> Items surfaced by the 2026-06-08 review that belong to a LATER epic (registered against the
> owning epic, to be fixed in that epic's own review — not here), plus Epic 2 ACs that genuinely
> can't close yet. See `epic-2-code-review-report.md` for full context.

**Pre-existing `@leedi/dashboard` typecheck errors in later-epic code** (caught while validating
Epic 2 changes; `pnpm --filter @leedi/dashboard typecheck`):

- **[Epic 6] `@leedi/dashboard`** — `app/(shell)/conhecimento/produtos/[id]/product-detail-client.tsx:5`
  imports `@/components/knowledge/ArgumentList` but no `@/` path alias is configured (TS2307), and
  `components/knowledge/ArgumentList.tsx:95` passes `string | undefined` where `string` is required
  (TS2345). (Matches the long-standing "Pending Typecheck Epic 6" note.)
- **[Epic 12] `@leedi/dashboard`** — `app/(shell)/templates/new/page.tsx:29` passes
  `libraryId: string | undefined` to a `BuilderProps` requiring `string` under
  `exactOptionalPropertyTypes` (TS2375).
- **[Epic 18] `@leedi/dashboard`** — `src/lib/push-registration.ts:24` assigns
  `Uint8Array<ArrayBufferLike>` where a `BufferSource`/`ArrayBuffer` is expected (TS2322).

Pre-existing `@leedi/api` typecheck errors in later-epic code (caught while validating Epic 2
changes; `pnpm --filter @leedi/api typecheck`):

- **[Epic 6] `@leedi/api`** — `routes/knowledge/knowledge-base.ts:26` passes optional `tipo`/`categoria`
  as `undefined` under `exactOptionalPropertyTypes` (TS2379).
- **[Epic 7] `@leedi/agent`** — `tools/transferir-humano.ts:216` cannot find module `@leedi/notification`
  (TS2307) — missing dep / export.
- **[Epic 10] `@leedi/api`** — `jobs/__tests__/campaign-phase-transition.test.ts:86` object possibly
  undefined (TS2532).
- **[Epic 17] `@leedi/api`** — `jobs/daily-billing-check.ts:24` `OverdueRow` does not satisfy
  `Record<string, unknown>` (TS2344).

**Epic 2 ACs that cannot close yet (kept under Epic 2):**

- ~~**[2.8 / cross-app] Audit-on-mutation (AC#2)**~~ — **IMPLEMENTED 2026-06-08** (Option B, Caio's
  call). `requireTenantSession` is now impersonation-aware (`resolveImpersonation` validates
  super_admin + tenant∈workspace + expiry + cookie-owner == session, mirroring `startImpersonation`)
  and audits **every** mutating request under impersonation, fail-closed (no unaudited writes).
  `apps/api` is the universal chokepoint (all `/api/tenants/*` routers use `requireTenantSession`; the
  dashboard proxies forward cookies). 10 unit tests on the auth decision. **Remaining (Caio):** validate
  the impersonated write+audit flow in **staging** (cannot be runtime-tested here). **Known gap:**
  mutations via direct dashboard server actions (not the `/api/tenants/*` proxies — e.g. the team
  inviteAction) are not covered by this API-layer audit; integration features (WhatsApp/Hotmart/agent/
  campaigns) DO go through the proxies and are covered.
- ~~**[2.6 polish] Team members / pending-invitation listing**~~ — **RESOLVED 2026-06-08**:
  `listTenantMembers` + `listPendingInvitations` use-cases (unit-tested) render on the team page with a
  "Pendente" badge; AC#1 closed. **Remaining (optional):** Reenviar/Cancelar pending-invite actions
  (Task 5 polish). **AC#2 accept→dashboard** still redirects to `/login` (correct under email
  verification; auto-session-on-accept is **Epic 19** onboarding/session work).
- **[2.8 limitation] Impersonation + `/settings/*`** — `requireTenantRouteAccess` is membership-based,
  so an impersonating super-admin (no membership in the target tenant) is redirected from restricted
  settings pages. Pre-existing documented limitation; revisit if support needs settings access while
  impersonating.

**Optional hardening (defense-in-depth, not a defect):**

- **[2.8] No server-side impersonation revocation before expiry** — impersonation is a cookie overlay
  with no DB-backed session record to kill, so an active 1h window can't be force-ended early. The
  `leedi_impersonation_expires` cookie is httpOnly but unsigned (user-editable via devtools); blast
  radius is bounded (a forger must already be a super_admin acting on their own workspace's tenant) and
  it's pre-existing (the dashboard layout uses the same model). Revisit only if early revocation is
  needed.

- **[2.5] `/settings/*` floor guard** — RBAC enforcement now lives per-page (`requireTenantRouteAccess`).
  A future `/settings/*` page added without that call would be silently unprotected. Optional: add a
  `apps/dashboard/app/(shell)/settings/layout.tsx` calling `requireTenantRouteAccess('/settings')` to
  enforce the owner/admin floor for the whole subtree (hardcoded route — no pathname needed), with
  per-page guards still adding owner-only for billing/whatsapp.

**Workstream B — RLS activation (IN PROGRESS as of 2026-06-08; see report §9):**

Refined to a **lower-risk design**: only the sanctioned `withTenant`/`withUser` path connects as the
non-BYPASSRLS role (`appDb`); direct `db` access and `withServiceRole` stay on the privileged
connection. This enforces RLS on the path the architecture mandates (and that `rls.test.ts` exercises)
with **zero blast radius** on direct queries, and is **backward-compatible** (no `APP_DATABASE_URL` →
`appDb` falls back to `db`, behavior unchanged).

Done this session (safe / backward-compatible):
- ✅ Provisioned role `leedi_app` (LOGIN, NOSUPERUSER, **NOBYPASSRLS**) + GRANTs on all tables/sequences
  + default privileges for future tables (via Supabase MCP). Created **without a password** (Caio sets it).
- ✅ `APP_DATABASE_URL` added as an OPTIONAL env var (`packages/config/src/schema.ts`).
- ✅ `packages/db/src/client.ts` exposes `appDb`; `withTenant`/`withUser` use it, `withServiceRole`
  stays on `db` (`packages/db/src/index.ts`).
- ✅ Hardened-policies migration written: `packages/db/migrations/0018_epic2_rls_hardening.sql`
  (memberships write-scoping #7; audit_logs RLS-path SELECT denied #8). **Not yet applied.**

Migration `0018_epic2_rls_hardening.sql` **APPLIED to Supabase** (2026-06-09, via MCP); policies +
`leedi_app` grants verified at the DB level.

**BLOCKER discovered at cutover (Supabase infra, not our code):** the Supabase **shared pooler
(Supavisor)** only authenticates the built-in `postgres` role — connecting as a custom role
(`leedi_app.<ref>`) fails with `(ENOTFOUND) tenant/user leedi_app.<ref> not found`. So the RLS-enforced
`leedi_app` connection cannot use the shared pooler. Custom-role options on Supabase:
  1. **Direct connection** `postgresql://leedi_app:<pw>@db.<ref>.supabase.co:5432/postgres` (username
     `leedi_app`, NO `.<ref>` suffix). Works for custom roles, but IPv6-only unless the IPv4 add-on is
     enabled, and it does NOT pool — risky for serverless (connection exhaustion).
  2. **Dedicated Pooler** (PgBouncer, paid tier) — supports custom roles + pooling.

This is a production-infra/cost decision for Caio. The code is **shipped and backward-compatible**:
with `APP_DATABASE_URL` unset, `appDb` falls back to the privileged connection and the app runs exactly
as before (tenant isolation enforced at the application layer via `withTenant`). RLS-as-safety-net is
ready to switch on the moment a working custom-role connection string exists.

**DECISION 2026-06-09 (Caio): accept the app-layer-only limitation for now** (mirrors Epic 1's BYPASSRLS
deferral). `APP_DATABASE_URL` stays unset → `appDb` falls back to the privileged connection; isolation is
enforced at the application layer (`withTenant`). 2.4 moved to `done` on this basis. The DB-level RLS net
(migration 0018 + `leedi_app`) is applied and dormant.

**FUTURE activation (when a custom-role connection exists — Dedicated Pooler or direct):** set
`APP_DATABASE_URL` to the `leedi_app` connection, run `rls.test.ts` (the cross-tenant test must pass),
validate in staging. No code changes needed — the capability is shipped.

---

## 🎯 MILESTONE — Supabase Pro upgrade / staging validation (Epic 2 acceptance follow-ups)

> Both Epic 2 stories below are **code-complete and `done`** (the code review corrected everything
> codeable). What remains is **acceptance validation in a deployed environment**, batched here per Caio's
> decision (2026-06-09) to run it when the project moves to the **Supabase Pro plan** (Dedicated Pooler).

1. **[2.4] Activate DB-level RLS** — REQUIRES Supabase Pro (Dedicated Pooler) so the non-BYPASSRLS
   `leedi_app` role can connect with pooling (the shared pooler rejects custom roles). Steps: build
   `APP_DATABASE_URL` for `leedi_app` via the Dedicated Pooler → set it in env → run
   `packages/db/src/__tests__/rls.test.ts` (the cross-tenant isolation test must pass) → validate in
   staging. Migration `0018` + role + code already in place; no code changes needed.

2. **[2.8] Exercise impersonation write+audit** — does NOT strictly require Pro (the audit writes via the
   current privileged connection), but grouped here for a single validation pass on a deployed env: log
   in as a `super_admin`, impersonate a tenant, perform a write through a `/api/tenants/*` route, and
   confirm an `audit_logs` row (actor = real super-admin, target = tenant). Fail-closed by design, so
   this is acceptance, not a security gate.

---

## Deferred from: code review of Epic 1 (2026-06-08) — lint debt in later-epic code

> Context: the Epic 1 lint *mechanism* (Story 1.2/1.8) is correct and unscoped; it is
> correctly catching real debt in later-epic code, which makes `pnpm lint` RED on `main`.
> Per the team workflow these are **not Epic 1 defects** — each item below is registered
> against the epic that owns the file, to be fixed in that epic's own review (do **not**
> fix here). Gate rationale: `epic-1-test-ci-backlog.md`. Most are trivial (unused vars in
> tests, `prefer-const`); **two are substantive — flagged ⚠️.** Run `pnpm --filter <pkg> lint`
> for exact line numbers.

- **[Epic 4] `@leedi/connection`** — `src/__tests__/check-connection-health.test.ts`: `no-explicit-any`. Type the value or add a justified `eslint-disable-next-line`.
- **[Epic 6] `@leedi/knowledge`** — `src/use-cases/__tests__/search-knowledge-base.test.ts`: `capturedConditions` assigned but never used.
- **[Epic 10] `@leedi/dashboard`** — `app/(shell)/campanhas/[id]/campaign-detail-client.tsx`, `campanhas/campaign-list-client.tsx`, `components/active-campaign-widget.test.ts`: `setState` called synchronously within an effect (cascading-renders rule). Wrap in event handler / guard, or restructure the effect.
- **[Epic 11] `@leedi/api`** — `src/use-cases/gateway/handle-recovery-event.ts` (`captureException` unused import) + `gateway/__tests__/handle-purchase-approved.test.ts` (`withServiceRoleCallCount`, `withTenantCallCount`, `buildTenantTx`, `journeyRow`, `productRow` unused).
- **[Epic 12] `@leedi/dashboard`** — `app/(shell)/templates/template-builder-client.tsx` + `template-list-client.tsx`. ⚠️ `template-builder-client.tsx:~107` calls `prefillFromLibrary(entry)` inside a `useEffect` **before** its `useCallback` declaration (~112) → `no-use-before-define`. Not a live runtime bug (effects run post-commit, the `const` is already initialized), but reorder the declaration above the effect and add `prefillFromLibrary` to the dep array (currently missing → exhaustive-deps). Plus `setState`-in-effect on the list client.
- **[Epic 13] `@leedi/dashboard` + `@leedi/api`** — dashboard `app/(shell)/disparos/{[id]/dispatch-detail-client,dispatch-list-client,regras/rules-list-client,segmentos/segment-list-client}.tsx`: `setState`-in-effect. api `src/jobs/__tests__/run-dispatch-job.test.ts`: unused/`prefer-const`.
- **[Epic 14] `@leedi/dashboard` + `@leedi/api`** — dashboard `conversas/[windowId]/components/conversa-detail-client.tsx`, `conversas/components/conversas-client.tsx`: `setState`-in-effect. api `routes/inbox/actions.ts` (`notification` unused) + `routes/inbox/__tests__/inbox-actions.test.ts` (`proxy` → `const`).
- **[Epic 15] `@leedi/dashboard` + `@leedi/api`** — dashboard `app/(shell)/components/dashboard-client.tsx`: `setState`-in-effect + `MS_PER_DAY` unused. api `routes/__tests__/analytics.test.ts`: `TENANT_ID`, `makeSelectChain`, `schema` unused + `proxy` → `const`.
- **[Epic 16] `@leedi/usage` + `@leedi/api`** — usage `src/use-cases/get-usage-counter.ts` (`sql` unused) + `increment-usage.ts` (`withServiceRole` unused). api `routes/__tests__/usage.test.ts` (`proxy` → `const`).
- **[Epic 17] `@leedi/api`** — `routes/billing.ts` (`sql` unused), `routes/__tests__/billing.test.ts` (`proxy` → `const`), `jobs/daily-billing-check.ts` (unused).
- **[Epic 18] `@leedi/dashboard`** — ⚠️ `src/lib/push-registration.ts:~10` uses `process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY` directly → trips the Epic 1 `no-process-env` guard. **This is a legitimate exception, not a real violation**: `@leedi/config` is server-only (loads `node:path` at import, crashes in the browser bundle) and Next.js inlines `NEXT_PUBLIC_*` at build time. Fix = add a justified `eslint-disable-next-line no-restricted-properties` with a comment; do **not** route client code through `@leedi/config`.
- **[Epic 19] `@leedi/api`** — `src/__tests__/{onboarding-complete,onboarding-hotmart,onboarding}.test.ts`: unused vars / `prefer-const`.

## Deferred from: code review of Epic 4 (2026-06-09)

- **[Epic 4 → cross-cutting] Internal API URL derivation breaks in production.** Internal/job/webhook
  URLs are derived via `env.BETTER_AUTH_URL.replace(':3000', \`:${env.API_PORT}\`)` in ~40 sites
  (originating from `apps/api/src/routes/webhook-meta.ts`). In a production `BETTER_AUTH_URL` with no
  `:3000` port (e.g. `https://app.leedi.com`), the replace is a no-op and the derived URL points at the
  wrong host, breaking QStash callbacks / inter-service calls. **Proper fix:** introduce a dedicated
  `INTERNAL_API_URL` (or `API_BASE_URL`) env var in `@leedi/config` and replace the string-hack at all
  call sites. Out of scope for the Epic 4 review (touches ~40 files across api + dashboard). See
  `epic-4-code-review-report.md` Finding 5.

## Deferred from: code review of Epic 5 (2026-06-10)

- **[Epic 5 → Epic 16] Rolling `messages` partition maintenance (silent message loss after 2026-08-31).**
  Migration `0006` ships only `2026_06`/`2026_07`/`2026_08` partitions; inbound after Aug 31 2026 throws
  on insert and the error is swallowed by `processMessage(...).catch(captureException)`. Mitigation is the
  scheduled rolling-partition Edge Function (Epic 16, `project_partition_maintenance`). Promoted to launch
  gate **PL-15** in `pendencias-pre-launch.md`. See `epic-5-code-review-report.md` F4.
- **[Epic 5 → messaging/agent epic] `ultima_interacao` never refreshed on inbound.** `findOrCreateLeadByPhone`
  returns early for existing leads and never bumps `ultima_interacao`; the message-save path doesn't touch
  `leads` either. The list view sorts `ultima_interacao DESC NULLS LAST`, so active leads never float up.
  No Epic 5 AC mandates the update; owned by whichever epic owns inbound side effects. See F6.
- **[Epic 5 · perf] `messages` UPDATEs scan all partitions.** `recordOutboundMessage.markSent/markFailed`
  and `webhook-meta.handleStatusUpdate` filter by `id`/`meta_message_id` without `created_at`, defeating
  partition pruning. Correct, just slower as partitions accumulate. See F3.
- **[Epic 5 · CSV] Phone normalization over-accepts non-mobile numbers.** `parse-leads-csv.normalizeToE164`
  only prefixes `+55` for 11-digit non-`55` strings; a 10-digit landline passes the E.164 regex while
  missing a country code. Acceptable V1 heuristic; stricter `libphonenumber-js` pass later. See F5.
- **[Epic 5 → cross-cutting / test infra] `@leedi/notification` eager `webpush.setVapidDetails` at import.**
  Importing the notification barrel runs `setVapidDetails(env.VAPID_SUBJECT, …)` at module load, throwing
  when VAPID env is empty (e.g. in tests). It broke the Epic 5 webhook suite (fixed there by mocking) and
  **still breaks**, at HEAD (2026-06-10), these api suites whose code paths import `@leedi/usage` /
  `@leedi/notification` without mocking them:
  - `apps/api/src/jobs/__tests__/process-dispatch-batch.test.ts` — fix in **Epic 13** review
  - `apps/api/src/use-cases/connection/__tests__/handle-quality-update.test.ts` — fix in **Epic 13** review
  - `apps/api/src/__tests__/health.test.ts` — owning epic TBD (likely Epic 1 / infra)

  **AGREED ACTION (Caio, 2026-06-10): do NOT fix these now.** When each owning epic gets its formal
  `bmad-code-review`, apply the **same fix used in Epic 5's `webhook-meta.test.ts`** — add the two missing
  module mocks at the top of the failing suite (adjust the mocked surface to whatever that suite actually
  calls):
  ```ts
  vi.mock('@leedi/usage', () => ({
    checkUsageBlock: vi.fn().mockResolvedValue({ blocked: false }),
    incrementUsage: vi.fn().mockResolvedValue({ alertsDue: [] }),
  }));
  vi.mock('@leedi/notification', () => ({
    sendNotificationToTenantRole: vi.fn().mockResolvedValue(undefined),
  }));
  ```
  **Proper root-cause fix** (makes the per-suite mocks unnecessary going forward): lazy-init the push
  provider in `packages/notification/src/adapters/push-provider.ts` so `setVapidDetails` is not called at
  import time (or a shared test env-stub). That belongs to **Epic 18's review**.
  _(Epic 11 review applied the same per-suite `vi.mock('@leedi/notification')` workaround to
  `handle-purchase-approved.test.ts`.)_

## Deferred from: code review of Epic 11 (2026-06-10)

> Source: Epic 11 (Hotmart Gateway) code review. Stories 11.1–11.3 → done; all patch findings fixed.
> gateway pkg 19/19 + api gateway/hotmart 15/15 green. Remaining items are pre-existing / out of Epic 11 scope.

- **[Epic-11 debt] `apiBaseUrl()` derives the internal callback base via `BETTER_AUTH_URL.replace(':3000', ':${API_PORT}')`** —
  a no-op when the URL has no `:3000` (e.g. production HTTPS without an explicit port), which would point QStash
  callbacks at the wrong host. **Project-wide pre-existing pattern (12+ sites):** `webhooks/hotmart.ts`,
  `webhooks/asaas.ts`, `use-cases/gateway/{create-gateway-integration,handle-recovery-event}.ts`,
  `jobs/{campaign-phase-transition,process-dispatch-batch,run-dispatch-job,send-followup}.ts`,
  `use-cases/dispatch/create-dispatch-job.ts`, `routes/{onboarding,webhook-meta}.ts`. Fix once globally
  (single `resolveApiBaseUrl()` helper or a dedicated `API_BASE_URL` env). **Pre-launch checklist candidate.**
- **[Epic-11 debt] Hotmart webhook idempotency is app-layer (SELECT-then-INSERT, no unique index)** —
  two concurrent identical webhooks can both pass `isDuplicate()` and double-insert into `gateway_events`
  [`apps/api/src/routes/webhooks/hotmart.ts:100`]. Accepted V1 limitation per story 11.1 Dev Notes; low
  likelihood. Revisit with a unique/computed-column index on the dedup key if duplicates surface in production.
- **[Epic-11 debt — out of scope] Pre-existing typecheck error in Epic 17:** `apps/api/src/jobs/daily-billing-check.ts:24`
  — `OverdueRow` does not satisfy `Record<string, unknown>` index-signature constraint. Not gateway-related;
  belongs to **Epic 17's review**.
- **[Epic-11 debt — out of scope] Full-suite test pollution in other epics:** `process-dispatch-batch.test.ts` (3, Epic 13),
  `handle-quality-update.test.ts` (1, Epic 13), `health.test.ts` (Epic 1/7) fail only in the full `@leedi/api`
  run (5–6s timeouts) — same unmocked-side-effect-at-import root cause documented above. Pass in isolation.
  Belong to their respective epic reviews.

## Deferred from: code review of Epic 12 (stories 12.1 & 12.2) (2026-06-10)

- **[12.1] Concurrent submit TOCTOU:** `submitTemplate` checks `status==='rascunho'` and performs the
  final UPDATE in separate transactions with the Meta network call between them, with no `status='rascunho'`
  predicate on the UPDATE — two simultaneous `POST /:id/submit` both POST to Meta. Low-likelihood under V1
  single-admin; atomic-claim fix trades off against AC#5 (transient `pendente` window before Meta confirms).
- **[12.1] Server-side variable coverage validation:** no check that body `{{N}}` placeholders match
  `variaveis` indices or are sequential from 1; `{{0}}` is accepted then rejected with a misleading
  `variaveis` error. UI enforces coverage today; hardening for direct-API callers and duplicate drift.
- **[12.1 — systemic] RLS `WITH CHECK` missing:** `templates` (and every other tenant-isolation policy in
  `packages/db/migrations/`) defines `USING` only, so INSERT/UPDATE post-images aren't constrained at the DB
  write boundary. Repo-wide pattern; app-layer `withTenant` mitigates. Candidate for a cross-cutting
  pre-launch hardening migration (add `WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid)`).
- **[12.1] Migration seed dead `variaveis` key:** `componentes_sugeridos` in the 0012 SQL seed embeds a
  `variaveis` array that the `TemplateComponentes` type and the builder ignore (builder re-derives from body);
  the TS seed source omits it. No functional impact; migration already applied.
- **[12.2 — pre-existing Epic 4] Webhook `JSON.parse` unwrapped:** a signed-but-malformed body throws in the
  POST handler → 500 → Meta retries the poisoned payload. In `webhook-meta.ts:145` (Epic 4 infra).
- **[12.2 — pre-existing Epic 4] Webhook `webhook:unknown` rate-limit bucket:** `message_template_status_update`
  payloads carry no `metadata.phone_number_id`, so all template-status callbacks across tenants collapse into
  the single `webhook:unknown` 1000/min bucket; a cross-tenant approval burst can 429-drop legit updates.
  Consider keying non-message fields on `waba_id`.

## Deferred from: code review of Epic 13 (2026-06-10)

- Story 13.1 — Tag filter UI is free-text comma list, not multi-select from tenant's existing tags (AC#1).
- Story 13.2 — Dispatch detail page shows raw status counts, not percentage breakdowns (AC#8).
- Story 13.2 — Residual at-least-once send window in process-dispatch-batch (send-then-mark); needs an atomic claim state (no `enviando` enum value today).
- Story 13.2 — `apiBaseUrl()` `:3000` string replace fragile in prod (already deferred project-wide in Epic 11 review).
- Story 13.3 — `list-dispatch-targets.ts` documented as the single LGPD opt-out enforcement seam but never imported (dead code); decide wire-or-delete after the inline `bloqueado` fix.
- ~~Story 13.4 — `agendar_followup` accepts `emHoras` instead of spec's `agendado_para`~~ ✅ RESOLVED 2026-06-11: contract aligned to `agendado_para` ISO + exact AC#2 error.
- Story 13.4 — `cancelado` note "Lead convertido antes do envio" not persisted (AC#6); `followups` has no note column.
- ~~Story 13.5 — "Retomar" button + badge + manual-resume endpoint missing (AC#5)~~ ✅ RESOLVED 2026-06-11: `/resume` endpoint + use-case + dashboard badge/button shipped (UI visual validation flagged for e2e harness).

## Deferred from: code review of Epic 14 (2026-06-11)

- Story 14.3 — `inbox_assignments` has no DB `UNIQUE(conversation_window_id)`; concurrent `transferir_humano` / window-creation can insert duplicate assignment rows the inbox detail/actions routes (`limit(1)`) can't disambiguate. App-level select-then-insert can't fully close it — proper fix is a migration adding the unique constraint (same class as PL-17). Also closes the residual takeover compare-and-set race.
- Story 14.3 — manual reply validates assignee/status, sends via Meta, and persists across three separate `withTenant` transactions; the assignee/status can change (return_to_bot / resolve / takeover-steal) during the Meta network round-trip, persisting a `humano` outbound on a conversation no longer `em_atendimento`. Low likelihood; proper fix folds validate+send+persist into one guarded path or re-checks status in the persisting tx.

## Deferred from: code review of Epic 15 (2026-06-11)

- Story 15.1 — `taxa_resposta` EXISTS subqueries on the partitioned `messages` table have no `created_at` bound, so they can't prune partitions and scan all of history (perf; story Dev Notes already defer materialization until query latency > 500ms).
- Story 15.1 — The 4 new analytics BFF proxy routes use `BETTER_AUTH_URL.replace(':3000', ':${API_PORT}')`, a no-op when the URL has no literal `:3000` (production). Same systemic defect deferred project-wide in Epic 11.
- Story 15.1 — Dashboard `dashboard-client.tsx` polling/date-change fetches have no AbortController/staleness guard; a stale in-flight response could overwrite newer data (low-risk race at the 60s cadence).
- Story 15.1/15.2/15.3 — Analytics queries (raw SQL and Drizzle) carry no explicit `tenant_id` predicate; tenant isolation relies entirely on `withTenant` → RLS, which is only enforced when `APP_DATABASE_URL` targets a non-BYPASSRLS role (otherwise `appDb === db`, BYPASSRLS). Systemic RLS hardening (pre-launch).
- Story 15.3 — `active-campaign` "most recently activated" is approximated by `ORDER BY updated_at DESC` (no `activated_at` column); a later campaign edit can reorder which active campaign is shown. Needs a schema column for a clean fix.
- Story 15.1/15.2/15.3 — Live UI not verified in a browser (component logic + API verified via unit tests/code review only); same precedent as Epic 8 — flagged for the e2e/a11y harness.
- Story 15.3 — AC#4 active-campaign widget shows the campaign's main product, not the phase-specific product (`downsell` offers `config.downsell.produto_id`). Deferred: cosmetic display that doesn't affect operation; fix when the product is in active use with real customers.

## Deferred from: code review of Epic 18 (2026-06-11)

- Story 18.1 — Notification RLS policies (`0017_notifications_schema.sql`) use `auth.uid()`, but the project uses Better-Auth, not Supabase Auth, so `auth.uid()` is NULL and all access is via `withServiceRole` (BYPASSRLS) → policies are decorative. Systemic (same as Epic 2 app-layer-only isolation). Pre-launch RLS milestone.
- Story 18.1 — Drizzle migration journal (`meta/_journal.json`) is out of sync: it stops at idx 16 while `0016_billing_schema`, `0017_notifications_schema`, `0018_epic2_rls_hardening`, `0019_*` exist on disk un-journaled, and `0016` is duplicated as a filename prefix. Migrations are applied out-of-band via the Supabase MCP so runtime is unaffected, but `drizzle-kit migrate` would be inconsistent. Systemic across epics 16/17/18. Pre-launch.
- Story 18.2 — Push subscription upsert (`push-subscriptions.ts`) targets `(user_id, endpoint)` on conflict and updates only `p256dh`/`auth`; a browser endpoint reused after a tenant switch keeps a stale `tenant_id`. Low impact (push routing keys on `user_id`). 
