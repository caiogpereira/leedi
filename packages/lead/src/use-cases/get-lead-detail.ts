import { withTenant, schema, eq, and, sql } from '@leedi/db';
import type { LeadTemperatura, LeadStatus } from './list-leads.js';

export interface GetLeadDetailInput {
  tenantId: string;
  leadId: string;
}

export interface LeadDetailTag {
  id: string;
  tag: string;
  origemTag: 'manual' | 'agente';
  createdAt: Date;
}

export interface LeadDetailJourneyEvent {
  id: string;
  tipo: string;
  detalhes: Record<string, unknown>;
  createdAt: Date;
}

export interface LeadDetail {
  id: string;
  tenantId: string;
  telefone: string;
  nome: string | null;
  email: string | null;
  origem: string | null;
  temperatura: LeadTemperatura;
  status: LeadStatus;
  comprou: boolean;
  produtoCompradoId: string | null;
  dataCompra: Date | null;
  primeiraInteracao: Date | null;
  ultimaInteracao: Date | null;
  qualificacao: Record<string, unknown>;
  leadRecorrente: boolean;
  createdAt: Date;
  updatedAt: Date;
  tags: LeadDetailTag[];
  journeyEvents: LeadDetailJourneyEvent[];
  conversationCount: number;
}

// Basic RFC 4122 UUID shape check. Postgres throws on a malformed uuid literal,
// so we short-circuit to a not-found (null) result before issuing any query.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

/**
 * Fetches a single lead (scoped to its tenant) with its tags and full journey timeline.
 *
 * Returns null when the lead does not exist for the tenant, or when leadId is not a
 * valid UUID — callers map null to a 404 / not-found page.
 *
 * All reads go through withTenant so RLS scopes rows to the caller's tenant. Tags are
 * ordered created_at ASC; journey events created_at DESC (most recent first).
 *
 * conversationCount is the number of conversation_windows opened for this lead
 * (the 24h billing unit from Story 5.5).
 */
export async function getLeadDetail(input: GetLeadDetailInput): Promise<LeadDetail | null> {
  if (!UUID_RE.test(input.leadId)) {
    return null;
  }

  return withTenant(input.tenantId, async (tx) => {
    const leadRows = await tx
      .select({
        id: schema.leads.id,
        tenantId: schema.leads.tenantId,
        telefone: schema.leads.telefone,
        nome: schema.leads.nome,
        email: schema.leads.email,
        origem: schema.leads.origem,
        temperatura: schema.leads.temperatura,
        status: schema.leads.status,
        comprou: schema.leads.comprou,
        produtoCompradoId: schema.leads.produtoCompradoId,
        dataCompra: schema.leads.dataCompra,
        primeiraInteracao: schema.leads.primeiraInteracao,
        ultimaInteracao: schema.leads.ultimaInteracao,
        qualificacao: schema.leads.qualificacao,
        leadRecorrente: schema.leads.leadRecorrente,
        createdAt: schema.leads.createdAt,
        updatedAt: schema.leads.updatedAt,
      })
      .from(schema.leads)
      .where(and(eq(schema.leads.id, input.leadId), eq(schema.leads.tenantId, input.tenantId)))
      .limit(1);

    const lead = leadRows[0];
    if (!lead) {
      return null;
    }

    const tagRows = await tx
      .select({
        id: schema.leadTags.id,
        tag: schema.leadTags.tag,
        origemTag: schema.leadTags.origemTag,
        createdAt: schema.leadTags.createdAt,
      })
      .from(schema.leadTags)
      .where(eq(schema.leadTags.leadId, input.leadId))
      .orderBy(sql`${schema.leadTags.createdAt} ASC`);

    const eventRows = await tx
      .select({
        id: schema.leadJourneyEvents.id,
        tipo: schema.leadJourneyEvents.tipo,
        detalhes: schema.leadJourneyEvents.detalhes,
        createdAt: schema.leadJourneyEvents.createdAt,
      })
      .from(schema.leadJourneyEvents)
      .where(eq(schema.leadJourneyEvents.leadId, input.leadId))
      .orderBy(sql`${schema.leadJourneyEvents.createdAt} DESC`);

    const windowCountRows = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.conversationWindows)
      .where(eq(schema.conversationWindows.leadId, input.leadId));

    const conversationCount = windowCountRows[0]?.count ?? 0;

    return {
      id: lead.id,
      tenantId: lead.tenantId,
      telefone: lead.telefone,
      nome: lead.nome,
      email: lead.email,
      origem: lead.origem,
      temperatura: lead.temperatura,
      status: lead.status,
      comprou: lead.comprou,
      produtoCompradoId: lead.produtoCompradoId,
      dataCompra: lead.dataCompra,
      primeiraInteracao: lead.primeiraInteracao,
      ultimaInteracao: lead.ultimaInteracao,
      qualificacao: asRecord(lead.qualificacao),
      leadRecorrente: lead.leadRecorrente,
      createdAt: lead.createdAt,
      updatedAt: lead.updatedAt,
      tags: tagRows.map((t) => ({
        id: t.id,
        tag: t.tag,
        origemTag: t.origemTag,
        createdAt: t.createdAt,
      })),
      journeyEvents: eventRows.map((e) => ({
        id: e.id,
        tipo: e.tipo,
        detalhes: asRecord(e.detalhes),
        createdAt: e.createdAt,
      })),
      conversationCount,
    };
  });
}
