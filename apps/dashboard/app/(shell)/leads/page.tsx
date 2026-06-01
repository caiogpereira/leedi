import Link from "next/link";
import { headers } from "next/headers";
import { Check } from "lucide-react";
import { getSession } from "@leedi/auth";
import { listUserTenants } from "@leedi/tenancy";
import { listLeads, type LeadTemperatura, type LeadStatus } from "@leedi/lead";
import { LeadsFilters } from "./leads-filters";

const PAGE_SIZE = 20;

const TEMPERATURAS: readonly LeadTemperatura[] = ["frio", "morno", "quente"];
const STATUSES: readonly LeadStatus[] = ["ativo", "optout", "bloqueado"];

const TEMPERATURA_BADGE: Record<LeadTemperatura, string> = {
  frio: "bg-gray-100 text-gray-700",
  morno: "bg-amber-100 text-amber-800",
  quente: "bg-red-100 text-red-700",
};

const TEMPERATURA_LABEL: Record<LeadTemperatura, string> = {
  frio: "Frio",
  morno: "Morno",
  quente: "Quente",
};

const STATUS_BADGE: Record<LeadStatus, string> = {
  ativo: "bg-green-100 text-green-700",
  optout: "bg-gray-100 text-gray-600",
  bloqueado: "bg-red-100 text-red-700",
};

const STATUS_LABEL: Record<LeadStatus, string> = {
  ativo: "Ativo",
  optout: "Opt-out",
  bloqueado: "Bloqueado",
};

function Badge({ className, children }: { className: string; children: React.ReactNode }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${className}`}
    >
      {children}
    </span>
  );
}

function formatDate(value: Date | null): string {
  if (!value) return "—";
  return value.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function parsePage(raw: string | string[] | undefined): number {
  const value = Array.isArray(raw) ? raw[0] : raw;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.trunc(n);
}

function pickEnum<T extends string>(
  raw: string | string[] | undefined,
  allowed: readonly T[]
): T | undefined {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return allowed.includes(value as T) ? (value as T) : undefined;
}

function buildHref(params: {
  temperatura?: string | undefined;
  status?: string | undefined;
  page: number;
}): string {
  const sp = new URLSearchParams();
  if (params.temperatura) sp.set("temperatura", params.temperatura);
  if (params.status) sp.set("status", params.status);
  if (params.page > 1) sp.set("page", String(params.page));
  const query = sp.toString();
  return query ? `/leads?${query}` : "/leads";
}

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<{ temperatura?: string; status?: string; page?: string }>;
}) {
  const params = await searchParams;
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

  const temperatura = pickEnum(params.temperatura, TEMPERATURAS);
  const status = pickEnum(params.status, STATUSES);
  const page = parsePage(params.page);

  const { leads, total } = await listLeads({
    tenantId: currentTenant.tenantId,
    page,
    pageSize: PAGE_SIZE,
    temperatura,
    status,
  });

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const hasPrev = page > 1;
  const hasNext = page < totalPages;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Leads</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {total} {total === 1 ? "lead" : "leads"} no total.
          </p>
        </div>
        <Link
          href="/leads/import"
          className="inline-flex items-center gap-1 rounded-md border px-3 py-2 text-sm font-medium hover:bg-muted"
        >
          + Importar CSV
        </Link>
      </div>

      <LeadsFilters temperatura={temperatura ?? ""} status={status ?? ""} />

      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50 text-left">
              <th className="px-4 py-2 font-medium">Nome</th>
              <th className="px-4 py-2 font-medium">Telefone</th>
              <th className="px-4 py-2 font-medium">Temperatura</th>
              <th className="px-4 py-2 font-medium">Status</th>
              <th className="px-4 py-2 font-medium">Última interação</th>
              <th className="px-4 py-2 font-medium">Comprou</th>
            </tr>
          </thead>
          <tbody>
            {leads.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                  Nenhum lead encontrado.
                </td>
              </tr>
            ) : (
              leads.map((lead) => (
                <tr key={lead.id} className="border-b last:border-0">
                  <td className="px-4 py-2">
                    <Link
                      href={`/leads/${lead.id}`}
                      className="font-medium text-primary hover:underline"
                    >
                      {lead.nome ?? "Lead sem nome"}
                    </Link>
                  </td>
                  <td className="px-4 py-2 font-mono text-xs">
                    <Link href={`/leads/${lead.id}`} className="hover:underline">
                      {lead.telefone}
                    </Link>
                  </td>
                  <td className="px-4 py-2">
                    <Badge className={TEMPERATURA_BADGE[lead.temperatura]}>
                      {TEMPERATURA_LABEL[lead.temperatura]}
                    </Badge>
                  </td>
                  <td className="px-4 py-2">
                    <Badge className={STATUS_BADGE[lead.status]}>
                      {STATUS_LABEL[lead.status]}
                    </Badge>
                  </td>
                  <td className="px-4 py-2">{formatDate(lead.ultimaInteracao)}</td>
                  <td className="px-4 py-2">
                    {lead.comprou ? (
                      <Check className="h-4 w-4 text-green-600" aria-label="Comprou" />
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Página {page} de {totalPages}
          </p>
          <div className="flex gap-2">
            {hasPrev ? (
              <Link
                href={buildHref({ temperatura, status, page: page - 1 })}
                className="rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-muted"
              >
                Página anterior
              </Link>
            ) : (
              <span className="cursor-not-allowed rounded-md border px-3 py-1.5 text-sm font-medium opacity-50">
                Página anterior
              </span>
            )}
            {hasNext ? (
              <Link
                href={buildHref({ temperatura, status, page: page + 1 })}
                className="rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-muted"
              >
                Próxima página
              </Link>
            ) : (
              <span className="cursor-not-allowed rounded-md border px-3 py-1.5 text-sm font-medium opacity-50">
                Próxima página
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
