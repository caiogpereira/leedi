import { getCurrentTenantContext } from "../../../../../lib/tenant-context";
import NovoProdutoForm from "./novo-form";

export default async function NovoProdutoPage() {
  const ctx = await getCurrentTenantContext();

  if (!ctx) {
    return <div className="p-8 text-muted-foreground">Nenhum workspace encontrado.</div>;
  }

  const currentTenant = ctx.tenant;

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
