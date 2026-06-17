import { getCurrentTenantContext } from "../../../../lib/tenant-context";
import { listKnowledgeBase } from "@leedi/knowledge";
import { FaqClient } from "./faq-client";

export default async function FaqPage() {
  const ctx = await getCurrentTenantContext();

  if (!ctx) {
    return <div className="p-8 text-muted-foreground">Nenhum workspace encontrado.</div>;
  }

  const currentTenant = ctx.tenant;

  const entries = await listKnowledgeBase({
    tenantId: currentTenant.tenantId,
    tipo: "faq",
  });

  return <FaqClient entries={entries} tenantId={currentTenant.tenantId} />;
}
