
## Deferred from: code review of Epic 2 (2026-06-04)

> Note: all items below were introduced by Epic 2 (not pre-existing).

- **[2.5/2.7] Dashboard route-gating fail-closed** — `middleware.ts` hardcodes `userRole = undefined`; all `/settings/*` routes 403 for every role pending per-tenant role resolution (Story 2.7). Fix the misleading page comment too. [apps/dashboard/middleware.ts:1216]
- **[2.5] RBAC surfaces unwired** — `usePermission` hook + API `requirePermission` middleware exist but no UI/API consumer; AC#2 (viewer metric gating) not demonstrable until later epics provide the surfaces.
- **[2.6] Invitation UI not wired** — `InviteForm` submit disabled with no action; team page lists no pending invites; accept redirects to `/login` not dashboard (AC#1/AC#2 unmet). Wiring deferred to Story 2.7.
- **[2.8] Audit-on-mutation not implemented (AC#2)** — `writeAuditLog` unwired; Task 4 Hono audit middleware in `apps/api` missing; integration/E2E tests (Task 7) absent.
- **[2.8] No shared `requireWorkspaceAdmin` helper / dashboard→admin redirect (Task 1)** — super_admin gate inlined in tenants page + impersonate route.
- **[2.8] `getWorkspaceAdmin` workspace scoping** — `.limit(1)` with no `workspaceId` filter; nondeterministic audit attribution if staff spans multiple workspaces.
- **[Cross-cutting] CSRF defense-in-depth** — custom state-changing routes rely solely on `SameSite=Lax`; no CSRF token / Origin check.

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
