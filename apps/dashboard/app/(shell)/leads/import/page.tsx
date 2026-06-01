import Link from "next/link";
import { headers } from "next/headers";
import { ArrowLeft } from "lucide-react";
import { getSession } from "@leedi/auth";
import { listUserTenants } from "@leedi/tenancy";
import { ImportForm } from "./import-form";

/**
 * CSV lead import page (Story 5.3).
 *
 * Server component: resolves the active tenant (re-validated against the user's
 * memberships, never trusting the forwarded x-leedi-tenant-id blindly) and hands
 * the tenantId to the interactive client form.
 */
export default async function LeadsImportPage() {
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

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Link
          href="/leads"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Voltar para leads
        </Link>
        <div>
          <h1 className="text-2xl font-bold">Importar leads via CSV</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Envie um arquivo .csv com a coluna{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">telefone</code>{" "}
            (obrigatória) e, opcionalmente,{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">nome</code> e{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">email</code>.
          </p>
        </div>
      </div>

      <ImportForm tenantId={currentTenant.tenantId} />
    </div>
  );
}
