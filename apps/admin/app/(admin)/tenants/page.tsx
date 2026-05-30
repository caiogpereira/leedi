import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getSession, getWorkspaceAdminRole } from "@leedi/auth";
import { listAllTenants } from "@leedi/tenancy";
import { ImpersonateButton } from "./ImpersonateButton";

/**
 * Tenant dashboard URL for the impersonation redirect. The tenant app runs on a
 * different port; cookies set by the impersonate route are visible there because
 * cookies ignore the port. Hardcoded for the local setup, mirroring the dashboard
 * middleware's `LOGIN_ORIGIN` convention.
 * TODO: derive from env (e.g. NEXT_PUBLIC_DASHBOARD_URL) once multi-origin config
 * is wired up.
 */
const DASHBOARD_URL = "http://localhost:3001";

/**
 * Workspace-admin tenant list (Story 2.8 AC#1).
 *
 * AUTHORIZATION (server-side, authoritative): resolves the session, then the
 * workspace role from `workspace_admins`. Only `super_admin` may reach the list —
 * `support` and non-admins are redirected to /403 BEFORE `listAllTenants` runs.
 * This guard is the gate in front of the RLS-bypassing service-role path, the
 * highest-risk surface in the app.
 */
export default async function TenantsPage() {
  const session = await getSession(await headers());
  if (!session?.user?.id) {
    redirect("/403");
  }

  const wsRole = await getWorkspaceAdminRole(session.user.id);
  if (wsRole !== "super_admin") {
    redirect("/403");
  }

  const t = await getTranslations("tenants");
  const tenants = await listAllTenants();

  return (
    <main className="mx-auto max-w-5xl space-y-6 p-8">
      <header>
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p className="mt-1 text-sm text-gray-600">{t("subtitle")}</p>
      </header>

      {tenants.length === 0 ? (
        <p className="text-sm text-gray-600">{t("empty")}</p>
      ) : (
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b text-left text-gray-500">
              <th className="py-2 pr-4 font-medium">{t("columns.name")}</th>
              <th className="py-2 pr-4 font-medium">{t("columns.slug")}</th>
              <th className="py-2 pr-4 font-medium">{t("columns.status")}</th>
              <th className="py-2 pr-4 font-medium">{t("columns.plan")}</th>
              <th className="py-2 pr-4 font-medium">{t("columns.actions")}</th>
            </tr>
          </thead>
          <tbody>
            {tenants.map((tenant) => (
              <tr key={tenant.id} className="border-b">
                <td className="py-3 pr-4 font-medium">{tenant.name}</td>
                <td className="py-3 pr-4 text-gray-600">{tenant.slug}</td>
                <td className="py-3 pr-4 text-gray-600">{tenant.status}</td>
                <td className="py-3 pr-4 text-gray-600">{tenant.plan}</td>
                <td className="py-3 pr-4">
                  <ImpersonateButton
                    tenantId={tenant.id}
                    tenantName={tenant.name}
                    dashboardUrl={DASHBOARD_URL}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
