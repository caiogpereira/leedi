-- Story 2.4 / Workstream B — RLS policy hardening (Epic 2 code review 2026-06-08).
--
-- Inert under the current BYPASSRLS `postgres` role; becomes effective ONLY once the
-- `withTenant`/`withUser` path connects as a NON-BYPASSRLS role (APP_DATABASE_URL =
-- leedi_app). Apply this migration TOGETHER with that role cutover and validate via
-- packages/db/src/__tests__/rls.test.ts (see epic-2-code-review-report.md §9).
--
-- Closes two code-review findings:
--   #7 — `memberships` was a single all-command policy whose `user_id = app.user_id`
--        read escape-hatch ALSO permitted writes (a user could self-insert/upgrade a
--        membership to `role='owner'`). Split into a SELECT policy (keeps the
--        tenant + user read paths) and write policies scoped to `app.tenant_id` with
--        WITH CHECK, so writes can only happen inside an active tenant context.
--        Verified safe for current write paths: acceptInvitation insert/update runs
--        under withTenant(tenantId) → tenant_id = app.tenant_id, so WITH CHECK passes.
--   #8 — `audit_logs` SELECT was `USING (true)` → world-readable across workspaces via
--        any tenant context. Audit reads happen ONLY on the privileged/service path
--        (which bypasses RLS), so the RLS-path SELECT is denied here. INSERT stays
--        permissive on purpose: audit rows are legitimately written from tenant
--        context (e.g. billing) and append-only is already enforced by the
--        REVOKE UPDATE, DELETE grant from migration 0000.

-- ── memberships ────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "tenant_isolation" ON "memberships";--> statement-breakpoint

-- Read: a user sees memberships of the active tenant OR their own memberships (the
-- login/tenant-list bootstrap path, where no tenant is selected yet).
CREATE POLICY "memberships_select" ON "memberships" FOR SELECT
  USING (
    "tenant_id" = current_setting('app.tenant_id', true)::uuid
    OR "user_id" = current_setting('app.user_id', true)::uuid
  );--> statement-breakpoint

-- Writes are confined to the active tenant context — NO user_id escape hatch, so a
-- user can never self-assign a role in an arbitrary tenant.
CREATE POLICY "memberships_insert" ON "memberships" FOR INSERT
  WITH CHECK ("tenant_id" = current_setting('app.tenant_id', true)::uuid);--> statement-breakpoint
CREATE POLICY "memberships_update" ON "memberships" FOR UPDATE
  USING ("tenant_id" = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK ("tenant_id" = current_setting('app.tenant_id', true)::uuid);--> statement-breakpoint
CREATE POLICY "memberships_delete" ON "memberships" FOR DELETE
  USING ("tenant_id" = current_setting('app.tenant_id', true)::uuid);--> statement-breakpoint

-- ── audit_logs ───────────────────────────────────────────────────────────────────
-- Deny audit reads on the RLS (tenant) path — audit is workspace/super-admin scoped
-- and is read only via the privileged service path (which bypasses RLS). This closes
-- the cross-workspace world-readable hole without affecting the service path.
DROP POLICY IF EXISTS "audit_select" ON "audit_logs";--> statement-breakpoint
CREATE POLICY "audit_select" ON "audit_logs" FOR SELECT USING (false);
