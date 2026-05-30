import { headers } from "next/headers";
import { getTranslations } from "next-intl/server";
import { getSession, hasPermission, type TenantRole } from "@leedi/auth";
import { InviteForm } from "./invite-form";

/**
 * Team settings (Story 2.6) — SCAFFOLD.
 *
 * The route /settings/team is already gated to owner/admin by the dashboard
 * middleware (ROUTE_PERMISSION_MAP). This page adds a defense-in-depth server
 * check and renders the members list + invite form.
 *
 * DEFERRED (Story 2.7): the per-tenant role and the current tenantId are NOT
 * resolvable server-side yet — the session does not carry the active tenant, and
 * the middleware explicitly defers tenant-role resolution. Until then:
 *   - the role gate below falls back to denying the invite form (fail-closed);
 *   - the members list is a placeholder (no tenant-scoped fetch is possible).
 * Wire real data once `getSession` exposes the active membership/role.
 */
export default async function TeamSettingsPage() {
  const t = await getTranslations("team");
  const session = await getSession(await headers());

  // Authoritative auth check (the middleware cookie check is optimistic only).
  if (!session) {
    return (
      <main className="mx-auto max-w-2xl p-8">
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p className="mt-4 text-gray-600">{t("noPermission")}</p>
      </main>
    );
  }

  // TODO(Story 2.7): resolve the caller's per-tenant role and the active tenantId
  // from the session's active membership. Until that exists, `userRole` is
  // undefined and the invite form is hidden (fail-closed) — the page still renders
  // as a scaffold so the route and layout are in place.
  const userRole: TenantRole | undefined = undefined;
  const canManageTeam = userRole ? hasPermission(userRole, "team:manage") : false;

  return (
    <main className="mx-auto max-w-2xl space-y-8 p-8">
      <h1 className="text-2xl font-bold">{t("title")}</h1>

      <section>
        <h2 className="mb-3 text-lg font-semibold">{t("membersHeading")}</h2>
        {/* TODO(Story 2.7): fetch tenant memberships once active tenant is known. */}
        <p className="text-sm text-gray-600">{t("emptyMembers")}</p>
      </section>

      {canManageTeam && (
        <section>
          <h2 className="mb-3 text-lg font-semibold">{t("inviteHeading")}</h2>
          <InviteForm allowOwnerRole={userRole === "owner"} />
        </section>
      )}
    </main>
  );
}
