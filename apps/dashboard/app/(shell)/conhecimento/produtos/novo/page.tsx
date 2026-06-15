import { headers } from "next/headers";
import { getSession } from "@leedi/auth";
import { listUserTenants } from "@leedi/tenancy";
import NovoProdutoForm from "./novo-form";

export default async function NovoProdutoPage() {
  const requestHeaders = await headers();
  const session = await getSession(requestHeaders);

  if (!session) {
    return <div className="p-8 text-muted-foreground">Sessão expirada.</div>;
  }

  const tenants = await listUserTenants(session.user.id);
  const headerTenantId = requestHeaders.get("x-leedi-tenant-id");
  const currentTenant = tenants.find((t) => t.tenantId === headerTenantId) ?? tenants[0];

  if (!currentTenant) {
    return <div className="p-8 text-muted-foreground">Nenhum workspace encontrado.</div>;
  }

  return (
    <div className="flex flex-col gap-6 p-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Novo produto</h1>
        <p className="text-sm text-muted-foreground">
          Preencha as informações do produto que o agente irá vender.
        </p>
      </div>

      <NovoProdutoForm tenantId={currentTenant.tenantId} />
    </div>
  );
}
