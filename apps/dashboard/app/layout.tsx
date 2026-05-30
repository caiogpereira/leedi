import type { Metadata } from "next";
import { headers } from "next/headers";
import { NextIntlClientProvider } from "next-intl";
import { getTranslations } from "next-intl/server";
import { ThemeProvider } from "@leedi/ui";
import { getSession } from "@leedi/auth";
import { listUserTenants, type UserTenant } from "@leedi/tenancy";
import "@leedi/ui/globals.css";
import messages from "../messages/pt-BR.json";
import { TenantSwitcher } from "../components/TenantSwitcher";

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

// Shell layout — locale hardcoded until i18n middleware is configured (Epic 3+)
export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const requestHeaders = await headers();
  const session = await getSession(requestHeaders);

  const tenants = session?.user?.id ? await listUserTenants(session.user.id) : [];
  const currentTenantId = resolveCurrentTenantId(
    requestHeaders.get("x-leedi-tenant-id"),
    tenants
  );

  const t = await getTranslations("app");

  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body>
        <ThemeProvider>
          <NextIntlClientProvider locale="pt-BR" messages={messages}>
            <header className="flex items-center justify-between border-b px-6 py-4">
              <span className="font-bold">{t("title")}</span>
              <TenantSwitcher tenants={tenants} currentTenantId={currentTenantId} />
            </header>
            <main>{children}</main>
          </NextIntlClientProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
