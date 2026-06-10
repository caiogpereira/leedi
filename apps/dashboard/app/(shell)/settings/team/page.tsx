import { getTranslations } from "next-intl/server";
import { listTenantMembers, listPendingInvitations } from "@leedi/tenancy";
import { InviteForm } from "./invite-form";
import { requireTenantRouteAccess } from "../../../../lib/tenant-context";

export default async function TeamSettingsPage() {
  const t = await getTranslations("team");

  // RBAC enforcement (Story 2.5/2.7): /settings/team is owner/admin only. The
  // membership-backed role is resolved here (the Edge middleware can't), and a
  // viewer/operator is redirected to /403 before any content renders.
  const ctx = await requireTenantRouteAccess("/settings/team");

  const [members, pending] = await Promise.all([
    listTenantMembers(ctx.tenant.tenantId),
    listPendingInvitations(ctx.tenant.tenantId),
  ]);

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <h1 className="text-2xl font-bold">{t("title")}</h1>

      <section>
        <h2 className="mb-3 text-lg font-semibold">{t("membersHeading")}</h2>
        {members.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("emptyMembers")}</p>
        ) : (
          <ul className="divide-y rounded-md border">
            {members.map((m) => (
              <li
                key={m.userId}
                className="flex items-center justify-between px-4 py-3 text-sm"
              >
                <span>{m.name ? `${m.name} · ${m.email}` : m.email}</span>
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium">
                  {t(`roles.${m.role}`)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">{t("pendingHeading")}</h2>
        {pending.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("emptyPending")}</p>
        ) : (
          <ul className="divide-y rounded-md border">
            {pending.map((inv) => (
              <li
                key={inv.email}
                className="flex items-center justify-between px-4 py-3 text-sm"
              >
                <span>{inv.email}</span>
                <span className="flex items-center gap-2">
                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium">
                    {t(`roles.${inv.role}`)}
                  </span>
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                    {t("statusPending")}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">{t("inviteHeading")}</h2>
        {/* Only an owner may grant the owner role (also enforced server-side in
            inviteMember). */}
        <InviteForm allowOwnerRole={ctx.role === "owner"} />
      </section>
    </div>
  );
}
