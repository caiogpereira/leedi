import Link from "next/link";
import { headers } from "next/headers";
import { Plus, Archive, Package } from "lucide-react";
import { getSession } from "@leedi/auth";
import { listUserTenants } from "@leedi/tenancy";
import { listProducts } from "@leedi/knowledge";

const TIPO_LABEL: Record<string, string> = {
  principal: "Principal",
  downsell: "Downsell",
  upsell: "Upsell",
  orderbump: "Order Bump",
};

const TIPO_BADGE: Record<string, string> = {
  principal: "bg-blue-100 text-blue-700",
  downsell: "bg-orange-100 text-orange-700",
  upsell: "bg-green-100 text-green-700",
  orderbump: "bg-purple-100 text-purple-700",
};

function Badge({ className, children }: { className: string; children: React.ReactNode }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${className}`}>
      {children}
    </span>
  );
}

function formatCurrency(value: string | null) {
  if (!value) return "—";
  const n = parseFloat(value);
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);
}

export default async function ProdutosPage({
  searchParams,
}: {
  searchParams: Promise<{ archived?: string }>;
}) {
  const params = await searchParams;
  const archived = params.archived === "true";
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

  const products = await listProducts({ tenantId: currentTenant.tenantId, archived });

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Produtos</h1>
          <p className="text-sm text-muted-foreground">
            Gerencie os produtos que o agente irá vender.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`?archived=${archived ? "false" : "true"}`}
            className="inline-flex items-center gap-1.5 rounded-md border px-3 py-2 text-sm hover:bg-muted"
          >
            <Archive className="h-4 w-4" />
            {archived ? "Ver ativos" : "Ver arquivados"}
          </Link>
          <Link
            href="/conhecimento/produtos/novo"
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground hover:bg-primary/90"
          >
            <Plus className="h-4 w-4" />
            Novo produto
          </Link>
        </div>
      </div>

      {products.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16 text-center">
          <Package className="mb-3 h-10 w-10 text-muted-foreground/40" />
          <p className="font-medium text-muted-foreground">
            {archived ? "Nenhum produto arquivado." : "Nenhum produto cadastrado."}
          </p>
          {!archived && (
            <Link
              href="/conhecimento/produtos/novo"
              className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground hover:bg-primary/90"
            >
              <Plus className="h-4 w-4" />
              Novo produto
            </Link>
          )}
        </div>
      ) : (
        <div className="rounded-lg border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="px-4 py-3 text-left font-medium">Nome</th>
                <th className="px-4 py-3 text-left font-medium">Tipo</th>
                <th className="px-4 py-3 text-right font-medium">Preço</th>
                <th className="px-4 py-3 text-left font-medium">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {products.map((product) => (
                <tr key={product.id} className="border-b last:border-0 hover:bg-muted/30">
                  <td className="px-4 py-3 font-medium">{product.nome}</td>
                  <td className="px-4 py-3">
                    <Badge className={TIPO_BADGE[product.tipo] ?? "bg-gray-100 text-gray-700"}>
                      {TIPO_LABEL[product.tipo] ?? product.tipo}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {formatCurrency(product.preco)}
                  </td>
                  <td className="px-4 py-3">
                    <Badge className={product.ativo ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}>
                      {product.ativo ? "Ativo" : "Arquivado"}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/conhecimento/produtos/${product.id}`}
                      className="text-primary hover:underline"
                    >
                      Editar
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
