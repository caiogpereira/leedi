import { cookies, headers } from "next/headers";
import { getSession, getWorkspaceAdminRole } from "@leedi/auth";
import { getTenantById, listUserTenants, type UserTenant } from "@leedi/tenancy";
import { ImpersonationBanner } from "../../components/ImpersonationBanner";
import { SidebarProvider } from "../../components/shell/sidebar-context";
import { Sidebar } from "../../components/shell/Sidebar";
import { Header } from "../../components/shell/Header";

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
  impersonatingTenantId: string | undefined
): Promise<ImpersonationContext | null> {
  if (!userId || !impersonatingTenantId) return null;
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
    cookieStore.get("leedi_impersonating")?.value
  );

  const tenants = session?.user?.id ? await listUserTenants(session.user.id) : [];
  const currentTenantId = impersonation
    ? impersonation.tenantId
    : resolveCurrentTenantId(requestHeaders.get("x-leedi-tenant-id"), tenants);

  return (
    <SidebarProvider>
      {impersonation && <ImpersonationBanner tenantName={impersonation.tenantName} />}
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
