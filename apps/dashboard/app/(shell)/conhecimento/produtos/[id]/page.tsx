import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { getSession } from "@leedi/auth";
import { listUserTenants } from "@leedi/tenancy";
import { getProduct } from "@leedi/knowledge";
import { ProductDetailClient } from "./product-detail-client";

export default async function ProductDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
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

  const product = await getProduct(currentTenant.tenantId, id);
  if (!product) notFound();

  return (
    <ProductDetailClient
      product={product}
      tenantId={currentTenant.tenantId}
    />
  );
}
