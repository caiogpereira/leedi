import { headers } from "next/headers";
import { getTranslations } from "next-intl/server";
import { getSession, hasPermission, type TenantRole } from "@leedi/auth";
import { InviteForm } from "./invite-form";

export default async function TeamSettingsPage() {
  const t = await getTranslations("team");
  const session = await getSession(await headers());

  if (!session) {
    return (
      <div className="mx-auto max-w-2xl p-8">
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p className="mt-4 text-muted-foreground">{t("noPermission")}</p>
      </div>
    );
  }

  // TODO(Story 2.7): resolve the caller's per-tenant role and the active tenantId
  // from the session's active membership. Until that exists, `userRole` is
  // undefined and the invite form is hidden (fail-closed).
  const userRole: TenantRole | undefined = undefined;
  const canManageTeam = userRole ? hasPermission(userRole, "team:manage") : false;

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <h1 className="text-2xl font-bold">{t("title")}</h1>

      <section>
        <h2 className="mb-3 text-lg font-semibold">{t("membersHeading")}</h2>
        <p className="text-sm text-muted-foreground">{t("emptyMembers")}</p>
      </section>

      {canManageTeam && (
        <section>
          <h2 className="mb-3 text-lg font-semibold">{t("inviteHeading")}</h2>
          <InviteForm allowOwnerRole={userRole === "owner"} />
        </section>
      )}
    </div>
  );
}
