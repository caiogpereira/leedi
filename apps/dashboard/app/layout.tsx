import type { Metadata } from "next";
import { cookies, headers } from "next/headers";
import { NextIntlClientProvider } from "next-intl";
import { getTranslations } from "next-intl/server";
import { ThemeProvider } from "@leedi/ui";
import { getSession, getWorkspaceAdminRole } from "@leedi/auth";
import { getTenantById, listUserTenants, type UserTenant } from "@leedi/tenancy";
import "@leedi/ui/globals.css";
import messages from "../messages/pt-BR.json";
import { TenantSwitcher } from "../components/TenantSwitcher";
import { ImpersonationBanner } from "../components/ImpersonationBanner";

export const metadata: Metadata = {
  title: "Leedi",
  description: "Plataforma de vendas inteligente via WhatsApp",
};

/**
 * Resolves the active tenant for this request (Story 2.7).
 *
 * The `x-leedi-tenant-id` header is forwarded by the Edge middleware from the
 * `leedi_tenant` cookie, but the middleware CANNOT verify membership (no DB on
 * Edge), so the header is attacker-controllable. We re-validate it here against
 * the user's actual memberships (READ-TIME authorization) and fall back to the
 * first tenant if it is missing or not a tenant the user belongs to.
 */
function resolveCurrentTenantId(
  headerTenantId: string | null,
  tenants: UserTenant[]
): string | null {
  if (headerTenantId && tenants.some((tenant) => tenant.tenantId === headerTenantId)) {
    return headerTenantId;
  }
  return tenants[0]?.tenantId ?? null;
}

interface ImpersonationContext {
  tenantId: string;
  tenantName: string;
}

/**
 * Resolves an ACTIVE impersonation session (Story 2.8 AC#1), server-verified.
 *
 * The `leedi_impersonating` cookie alone is NOT trusted — like the forwarded
 * tenant header, it is attacker-controllable. We re-verify, at read time, that
 * the signed-in user is genuinely a `super_admin` in `workspace_admins` before
 * honoring the impersonation. A forged/expired cookie therefore fails closed to
 * the normal (non-impersonating) context.
 *
 * The impersonated tenant is fetched via the service-role path (`getTenantById`)
 * because the super-admin is not a member of it — the normal membership-scoped
 * reads cannot see it. Returns `null` when there is no valid impersonation.
 */
async function resolveImpersonation(
  userId: string | undefined,
  impersonatingTenantId: string | undefined
): Promise<ImpersonationContext | null> {
  if (!userId || !impersonatingTenantId) {
    return null;
  }

  const wsRole = await getWorkspaceAdminRole(userId);
  if (wsRole !== "super_admin") {
    return null;
  }

  const tenant = await getTenantById(impersonatingTenantId);
  if (!tenant) {
    return null;
  }

  return { tenantId: tenant.id, tenantName: tenant.name };
}

// Shell layout — locale hardcoded until i18n middleware is configured (Epic 3+)
export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const requestHeaders = await headers();
  const cookieStore = await cookies();
  const session = await getSession(requestHeaders);

  // Impersonation takes precedence over the normal membership-based tenant
  // resolution (AC#1): when a verified super_admin is impersonating, the active
  // tenant IS the impersonated tenant, and the membership re-validation that
  // would otherwise reject a non-member is intentionally bypassed.
  const impersonation = await resolveImpersonation(
    session?.user?.id,
    cookieStore.get("leedi_impersonating")?.value
  );

  const tenants = session?.user?.id ? await listUserTenants(session.user.id) : [];
  const currentTenantId = impersonation
    ? impersonation.tenantId
    : resolveCurrentTenantId(requestHeaders.get("x-leedi-tenant-id"), tenants);

  const t = await getTranslations("app");

  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body>
        <ThemeProvider>
          <NextIntlClientProvider locale="pt-BR" messages={messages}>
            {impersonation && (
              <ImpersonationBanner tenantName={impersonation.tenantName} />
            )}
            <header className="flex items-center justify-between border-b px-6 py-4">
              <span className="font-bold">{t("title")}</span>
              {/* The tenant switcher is hidden during impersonation — the active
                  tenant is fixed to the impersonated one. */}
              {!impersonation && (
                <TenantSwitcher tenants={tenants} currentTenantId={currentTenantId} />
              )}
            </header>
            <main>{children}</main>
          </NextIntlClientProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
