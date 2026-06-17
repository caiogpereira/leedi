import { notFound } from "next/navigation";
import { getCurrentTenantContext } from "../../../../../lib/tenant-context";
import { getProduct } from "@leedi/knowledge";
import { ProductDetailClient } from "./product-detail-client";

export default async function ProductDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await getCurrentTenantContext();

  if (!ctx) {
    return <div className="p-8 text-muted-foreground">Nenhum workspace encontrado.</div>;
  }

  const currentTenant = ctx.tenant;

  const product = await getProduct(currentTenant.tenantId, id);
  if (!product) notFound();

  return (
    <ProductDetailClient
      product={product}
      tenantId={currentTenant.tenantId}
    />
  );
}
