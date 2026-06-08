// Story 13.1 — Segment evaluation. Builds a Drizzle WHERE clause from a segment's
// filter spec and runs it against the leads table, always scoped to tenantId.
//
// The condition-building logic is extracted into `buildSegmentConditions` (a pure
// function returning an array of Drizzle SQL conditions) so it is unit-testable
// without mocking the full query chain. evaluateSegment composes those conditions
// with and(), runs a COUNT + a (limited) preview SELECT, and joins lead tags.

import { withTenant, schema, eq, and, gte, lte, ilike, sql, inArray } from '@leedi/db';
import type { SQL } from '@leedi/db';

export interface SegmentFilters {
  /** When true → only leads with comprou=true; when false → only comprou=false. */
  comprou?: boolean;
  /** Lead must carry at least ONE of these tags (lead_tags.tag). */
  tag?: string[];
  /** Substring match on leads.origem (case-insensitive). */
  origem?: string;
  /** ISO date — leads captured (created_at) on/after this instant. */
  data_captura_inicio?: string;
  /** ISO date — leads captured (created_at) on/before this instant. */
  data_captura_fim?: string;
}

export interface SegmentPreviewLead {
  id: string;
  nome: string | null;
  telefone: string;
  tags: string[];
}

export interface EvaluateSegmentResult {
  count: number;
  leads: SegmentPreviewLead[];
}

// AC#3: preview returns a sample of at most 20 matching leads.
const DEFAULT_PREVIEW_LIMIT = 20;

/**
 * Builds the array of Drizzle conditions for a segment, ALWAYS prefixed with the
 * tenant scope. Returns the raw condition list so callers (and tests) can inspect
 * exactly what was generated.
 */
export function buildSegmentConditions(
  tenantId: string,
  filtros: SegmentFilters
): SQL[] {
  const conditions: SQL[] = [eq(schema.leads.tenantId, tenantId)];

  if (filtros.comprou !== undefined) {
    conditions.push(eq(schema.leads.comprou, filtros.comprou));
  }

  if (filtros.origem !== undefined && filtros.origem !== '') {
    conditions.push(ilike(schema.leads.origem, `%${filtros.origem}%`));
  }

  if (filtros.data_captura_inicio) {
    const inicio = new Date(filtros.data_captura_inicio);
    if (!Number.isNaN(inicio.getTime())) {
      conditions.push(gte(schema.leads.createdAt, inicio));
    }
  }

  if (filtros.data_captura_fim) {
    const fim = new Date(filtros.data_captura_fim);
    if (!Number.isNaN(fim.getTime())) {
      conditions.push(lte(schema.leads.createdAt, fim));
    }
  }

  const tags = (filtros.tag ?? []).filter((t) => t !== '');
  if (tags.length > 0) {
    // EXISTS subquery: the lead carries at least one of the requested tags.
    conditions.push(
      sql`EXISTS (SELECT 1 FROM lead_tags lt WHERE lt.lead_id = ${schema.leads.id} AND lt.tag = ANY(ARRAY[${sql.join(
        tags.map((t) => sql`${t}`),
        sql`, `
      )}]::text[]))`
    );
  }

  return conditions;
}

/**
 * Evaluates a segment's filters against the leads table for `tenantId`.
 * Returns the total matching count plus a bounded preview list with tags.
 */
export async function evaluateSegment(
  tenantId: string,
  filtros: SegmentFilters,
  opts?: { limit?: number }
): Promise<EvaluateSegmentResult> {
  const limit = opts?.limit ?? DEFAULT_PREVIEW_LIMIT;
  const conditions = buildSegmentConditions(tenantId, filtros);
  const whereClause = and(...conditions);

  return withTenant(tenantId, async (tx) => {
    const countRows = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.leads)
      .where(whereClause);
    const count = countRows[0]?.count ?? 0;

    const previewRows = await tx
      .select({
        id: schema.leads.id,
        nome: schema.leads.nome,
        telefone: schema.leads.telefone,
      })
      .from(schema.leads)
      .where(whereClause)
      .limit(limit);

    if (previewRows.length === 0) {
      return { count, leads: [] };
    }

    // Hydrate tags for the preview rows in one query.
    const leadIds = previewRows.map((r) => r.id);
    const tagRows = await tx
      .select({ leadId: schema.leadTags.leadId, tag: schema.leadTags.tag })
      .from(schema.leadTags)
      .where(
        and(
          eq(schema.leadTags.tenantId, tenantId),
          inArray(schema.leadTags.leadId, leadIds)
        )
      );

    const tagsByLead = new Map<string, string[]>();
    for (const row of tagRows) {
      const list = tagsByLead.get(row.leadId) ?? [];
      list.push(row.tag);
      tagsByLead.set(row.leadId, list);
    }

    const leads: SegmentPreviewLead[] = previewRows.map((r) => ({
      id: r.id,
      nome: r.nome,
      telefone: r.telefone,
      tags: tagsByLead.get(r.id) ?? [],
    }));

    return { count, leads };
  });
}

/**
 * Returns ALL matching lead ids for a segment (no preview limit). Used by the
 * dispatch job runner to build the target list. Scoped to tenantId.
 */
export async function resolveSegmentLeadIds(
  tenantId: string,
  filtros: SegmentFilters
): Promise<string[]> {
  const conditions = buildSegmentConditions(tenantId, filtros);
  const whereClause = and(...conditions);

  return withTenant(tenantId, async (tx) => {
    const rows = await tx
      .select({ id: schema.leads.id })
      .from(schema.leads)
      .where(whereClause);
    return rows.map((r) => r.id);
  });
}
