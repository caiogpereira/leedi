import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { getSession, getWorkspaceAdminRole } from "@leedi/auth";
import { getTenantById, listUserTenants, type UserTenant } from "@leedi/tenancy";
import { ImpersonationBanner } from "../../components/ImpersonationBanner";
import { SidebarProvider } from "../../components/shell/sidebar-context";
import { Sidebar } from "../../components/shell/Sidebar";
import { Header } from "../../components/shell/Header";
import { checkUsageBlock } from "@leedi/usage";
import { PushRegistrationInit } from "../../components/PushRegistrationInit";
import { withTenant, schema, eq } from "@leedi/db";
import type { OnboardingConfig } from "@leedi/db";

interface ImpersonationContext {
  tenantId: string;
  tenantName: string;
}

function resolveCurrentTenantId(
  headerTenantId: string | null,
  tenants: UserTenant[]
): string | null {
  if (headerTenantId && tenants.some((t) => t.tenantId === headerTenantId)) {
    return headerTenantId;
  }
  return tenants[0]?.tenantId ?? null;
}

async function resolveImpersonation(
  userId: string | undefined,
  impersonatingTenantId: string | undefined,
  expiresAtRaw: string | undefined
): Promise<ImpersonationContext | null> {
  if (!userId || !impersonatingTenantId) return null;
  // Re-validate the 1-hour expiry server-side (Story 2.8 — no silent renewal).
  // The cookie max-age is client-trustable; this is the authoritative check, so
  // an expired/forged/extended cookie falls back to the workspace-admin context.
  const expiresAt = Number(expiresAtRaw);
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) return null;
  const wsRole = await getWorkspaceAdminRole(userId);
  if (wsRole !== "super_admin") return null;
  const tenant = await getTenantById(impersonatingTenantId);
  if (!tenant) return null;
  return { tenantId: tenant.id, tenantName: tenant.name };
}

export default async function ShellLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const requestHeaders = await headers();
  const cookieStore = await cookies();
  const session = await getSession(requestHeaders);

  const impersonation = await resolveImpersonation(
    session?.user?.id,
    cookieStore.get("leedi_impersonating")?.value,
    cookieStore.get("leedi_impersonation_expires")?.value
  );

  const tenants = session?.user?.id ? await listUserTenants(session.user.id) : [];
  const currentTenantId = impersonation
    ? impersonation.tenantId
    : resolveCurrentTenantId(requestHeaders.get("x-leedi-tenant-id"), tenants);

  // 19.1 AC#1/AC#2: redirect trial tenants who haven't completed onboarding.
  // Uses a fresh DB read (not Edge middleware) because Edge can't hit the DB.
  if (currentTenantId && !impersonation) {
    const tenantRows = await withTenant(currentTenantId, async (tx) =>
      tx
        .select({ status: schema.tenants.status, config: schema.tenants.config })
        .from(schema.tenants)
        .where(eq(schema.tenants.id, currentTenantId))
        .limit(1)
    ).catch(() => []);

    const tenantRow = tenantRows[0];
    if (tenantRow?.status === "trial") {
      const cfg = tenantRow.config?.["onboarding_config"] as Partial<OnboardingConfig> | undefined;
      if (!cfg?.onboarding_completed) {
        redirect("/onboarding");
      }
    }
  }

  // 16.3 AC#5: check if the block-at-limit setting is active for the current tenant.
  const usageBlock = currentTenantId
    ? await checkUsageBlock(currentTenantId).catch(() => null)
    : null;
  const showBlockBanner = usageBlock?.blocked === true;

  return (
    <SidebarProvider>
      {currentTenantId && <PushRegistrationInit tenantId={currentTenantId} />}
      {impersonation && <ImpersonationBanner tenantName={impersonation.tenantName} />}
      {showBlockBanner && (
        <div
          role="alert"
          className="flex items-center justify-between bg-red-600 px-4 py-2 text-sm text-white"
        >
          <span>
            Limite de conversas atingido. Reative ou faça upgrade para continuar.
          </span>
          <a
            href="/settings/billing"
            className="ml-4 shrink-0 rounded border border-white/40 px-3 py-1 text-xs font-medium hover:bg-white/10"
          >
            Fazer upgrade
          </a>
        </div>
      )}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-background focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:ring-2 focus:ring-ring"
      >
        Ir para conteúdo
      </a>
      <div className="flex h-screen overflow-hidden">
        <Sidebar />
        <div className="flex flex-1 flex-col overflow-hidden">
          <Header tenants={tenants} currentTenantId={currentTenantId} />
          <main
            id="main-content"
            className="flex-1 overflow-auto p-6"
          >
            {children}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
