import { withTenant, schema, eq, and, or, ilike, sql, type SQL } from '@leedi/db';

export type LeadTemperatura = 'frio' | 'morno' | 'quente';
export type LeadStatus = 'ativo' | 'optout' | 'bloqueado';

export interface ListLeadsInput {
  tenantId: string;
  page?: number | undefined;
  pageSize?: number | undefined;
  temperatura?: LeadTemperatura | undefined;
  status?: LeadStatus | undefined;
  search?: string | undefined;
}

export interface LeadRow {
  id: string;
  telefone: string;
  nome: string | null;
  email: string | null;
  origem: string | null;
  temperatura: LeadTemperatura;
  status: LeadStatus;
  comprou: boolean;
  ultimaInteracao: Date | null;
  createdAt: Date;
}

export interface ListLeadsResult {
  leads: LeadRow[];
  total: number;
  page: number;
  pageSize: number;
}

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

/**
 * Lists leads for a tenant with optional temperatura/status/search filters and pagination.
 *
 * All reads go through withTenant so RLS scopes rows to the caller's tenant.
 * The same WHERE clause is reused for both the page query and the total count,
 * so pagination totals stay consistent with the applied filters.
 */
export async function listLeads(input: ListLeadsInput): Promise<ListLeadsResult> {
  const page = Math.max(1, Math.trunc(input.page ?? DEFAULT_PAGE));
  const requestedSize = Math.trunc(input.pageSize ?? DEFAULT_PAGE_SIZE);
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, requestedSize));
  const offset = (page - 1) * pageSize;

  const conditions: SQL[] = [eq(schema.leads.tenantId, input.tenantId)];

  if (input.temperatura) {
    conditions.push(eq(schema.leads.temperatura, input.temperatura));
  }

  if (input.status) {
    conditions.push(eq(schema.leads.status, input.status));
  }

  const search = input.search?.trim();
  if (search) {
    const pattern = `%${search}%`;
    const searchCondition = or(
      ilike(schema.leads.nome, pattern),
      ilike(schema.leads.telefone, pattern)
    );
    if (searchCondition) {
      conditions.push(searchCondition);
    }
  }

  const whereClause = and(...conditions);

  return withTenant(input.tenantId, async (tx) => {
    const rows = await tx
      .select({
        id: schema.leads.id,
        telefone: schema.leads.telefone,
        nome: schema.leads.nome,
        email: schema.leads.email,
        origem: schema.leads.origem,
        temperatura: schema.leads.temperatura,
        status: schema.leads.status,
        comprou: schema.leads.comprou,
        ultimaInteracao: schema.leads.ultimaInteracao,
        createdAt: schema.leads.createdAt,
      })
      .from(schema.leads)
      .where(whereClause)
      .orderBy(sql`${schema.leads.ultimaInteracao} DESC NULLS LAST`, sql`${schema.leads.createdAt} DESC`)
      .limit(pageSize)
      .offset(offset);

    const countRows = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.leads)
      .where(whereClause);

    const total = countRows[0]?.count ?? 0;

    return {
      leads: rows,
      total,
      page,
      pageSize,
    };
  });
}
