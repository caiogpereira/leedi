import { headers } from "next/headers";
import { getSession } from "@leedi/auth";
import { listUserTenants } from "@leedi/tenancy";
import { db, schema, eq } from "@leedi/db";
import { SalesMethodClient } from "./sales-method-client";

export default async function MetodoPage() {
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

  // Load global sales methods
  const methods = await db
    .select()
    .from(schema.salesMethods)
    .where(eq(schema.salesMethods.isGlobal, true));

  // Load current tenant preference from tenants.config
  const tenantRows = await db
    .select({ config: schema.tenants.config })
    .from(schema.tenants)
    .where(eq(schema.tenants.id, currentTenant.tenantId))
    .limit(1);

  const config = tenantRows[0]?.config as Record<string, unknown> | null ?? {};
  const currentMethodId = (config?.tenant_sales_method_preference as string) ?? null;

  return (
    <SalesMethodClient
      methods={methods}
      currentMethodId={currentMethodId}
      tenantId={currentTenant.tenantId}
    />
  );
}
