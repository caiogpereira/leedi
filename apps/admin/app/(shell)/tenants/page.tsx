import { getTranslations } from "next-intl/server";
import { listAllTenants } from "@leedi/tenancy";
import { ImpersonateButton } from "./ImpersonateButton";

const DASHBOARD_URL = "http://localhost:3001";

/**
 * Workspace-admin tenant list (Story 2.8 AC#1).
 *
 * Auth guard is at the shell layout level — this page only fetches data.
 */
export default async function TenantsPage() {
  const t = await getTranslations("tenants");
  const tenants = await listAllTenants();

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>

      {tenants.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("empty")}</p>
      ) : (
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b text-left text-muted-foreground">
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
                <td className="py-3 pr-4 text-muted-foreground">{tenant.slug}</td>
                <td className="py-3 pr-4 text-muted-foreground">{tenant.status}</td>
                <td className="py-3 pr-4 text-muted-foreground">{tenant.plan}</td>
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
    </div>
  );
}
