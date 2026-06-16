import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getSession, getWorkspaceAdminRole } from "@leedi/auth";
import { env } from "@leedi/config";
import { SidebarProvider } from "../../components/shell/sidebar-context";
import { AdminSidebar } from "../../components/shell/AdminSidebar";
import { AdminHeader } from "../../components/shell/AdminHeader";

/**
 * Admin shell layout — AC#3: guards every admin route.
 *
 * Authoritative check runs here in the layout, so child routes cannot bypass it.
 * Only `super_admin` workspace role may enter (getWorkspaceAdminRole reads from
 * workspace_admins, the source of truth per RBAC §5.3).
 */
export default async function AdminShellLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const requestHeaders = await headers();
  const session = await getSession(requestHeaders);

  if (!session?.user?.id) {
    // Login lives on the web app origin (BETTER_AUTH_URL), not this admin app —
    // a relative `/login` 404s here (no such route, no middleware). F-28.
    redirect(new URL("/login", env.BETTER_AUTH_URL).toString());
  }

  const wsRole = await getWorkspaceAdminRole(session.user.id);
  if (wsRole !== "super_admin") {
    // Authenticated but not a super-admin: this is a forbidden access, not a
    // missing session — send them to the in-app /403 page (F-28).
    redirect("/403");
  }

  return (
    <SidebarProvider>
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-background focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:ring-2 focus:ring-ring"
      >
        Ir para conteúdo
      </a>
      <div className="flex h-screen overflow-hidden">
        <AdminSidebar />
        <div className="flex flex-1 flex-col overflow-hidden">
          <AdminHeader />
          <main id="main-content" className="app-texture flex-1 overflow-auto p-6">
            {children}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
