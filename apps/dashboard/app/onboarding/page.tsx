import { headers } from "next/headers";
import { getSession } from "@leedi/auth";
import { listUserTenants } from "@leedi/tenancy";
import { OnboardingWizard } from "./_components/onboarding-wizard";

export default async function OnboardingPage() {
  const requestHeaders = await headers();
  const session = await getSession(requestHeaders);

  if (!session) {
    return <div className="text-muted-foreground">Sessão expirada.</div>;
  }

  const tenants = await listUserTenants(session.user.id);
  const headerTenantId = requestHeaders.get("x-leedi-tenant-id");
  const currentTenant = tenants.find((t) => t.tenantId === headerTenantId) ?? tenants[0];

  if (!currentTenant) {
    return <div className="text-muted-foreground">Nenhum workspace encontrado.</div>;
  }

  return <OnboardingWizard tenantId={currentTenant.tenantId} />;
}
