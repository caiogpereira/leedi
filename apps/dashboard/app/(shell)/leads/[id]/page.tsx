import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { getSession } from "@leedi/auth";
import { listUserTenants } from "@leedi/tenancy";
import { getLeadDetail } from "@leedi/lead";
import { LeadDetailClient } from "./lead-detail-client";

/**
 * Server shell for the lead-detail page (Story 5.2 + 5.4).
 *
 * Resolves the session, the current tenant, and the lead, then hands the data
 * to the interactive client component, which owns tag and status mutations.
 */
export default async function LeadDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const requestHeaders = await headers();
  const session = await getSession(requestHeaders);

  if (!session) {
    return (
      <div className="mx-auto max-w-2xl p-8">
        <p className="text-muted-foreground">Sessão expirada.</p>
      </div>
    );
  }

  const tenants = await listUserTenants(session.user.id);
  const headerTenantId = requestHeaders.get("x-leedi-tenant-id");
  const currentTenant =
    tenants.find((t) => t.tenantId === headerTenantId) ?? tenants[0];

  if (!currentTenant) {
    return (
      <div className="mx-auto max-w-2xl p-8">
        <p className="text-muted-foreground">Nenhum workspace encontrado.</p>
      </div>
    );
  }

  const lead = await getLeadDetail({ tenantId: currentTenant.tenantId, leadId: id });

  if (!lead) {
    notFound();
  }

  return (
    <div className="space-y-6">
      <div>
        <Link href="/leads" className="text-sm text-muted-foreground hover:text-foreground">
          ← Voltar para Leads
        </Link>
      </div>

      <LeadDetailClient initialLead={lead} tenantId={currentTenant.tenantId} />
    </div>
  );
}
