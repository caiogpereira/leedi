import { getCurrentTenantContext } from "../../../../lib/tenant-context";
import { listKnowledgeBase } from "@leedi/knowledge";
import { ObjecoesClient } from "./objecoes-client";

export default async function ObjeoesPage() {
  const ctx = await getCurrentTenantContext();

  if (!ctx) {
    return <div className="p-8 text-muted-foreground">Nenhum workspace encontrado.</div>;
  }

  const currentTenant = ctx.tenant;

  const entries = await listKnowledgeBase({
    tenantId: currentTenant.tenantId,
    tipo: "objecao",
  });

  return <ObjecoesClient entries={entries} tenantId={currentTenant.tenantId} />;
}
