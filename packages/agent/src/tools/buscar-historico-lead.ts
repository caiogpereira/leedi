// Tool: buscar_historico_lead — always-on lead-context read.
// Returns the lead's identity/purchase/qualification snapshot plus the last 20
// journey events (newest first), so the agent can personalize the conversation
// and surface previous objections (events of tipo='objecao' fall in this window).
//
// schema-vs-ctx boundary: Claude supplies NOTHING for this tool. tenantId and
// leadPhone come from ToolContext (injected by routeToolCall). All reads go
// through withTenant so RLS is enforced.

import { withTenant, schema, eq, and, sql } from '@leedi/db';
import type { ToolContext } from './types.js';

/** A single lead journey event, trimmed to what the agent needs. */
export interface LeadJourneyEvent {
  tipo: string;
  detalhes: unknown;
  createdAt: Date;
}

/** Identity + purchase + qualification snapshot returned to the agent. */
export interface LeadHistoryResult {
  found: boolean;
  lead: {
    id: string;
    nome: string | null;
    telefone: string;
    temperatura: 'frio' | 'morno' | 'quente';
    status: 'ativo' | 'optout' | 'bloqueado';
    comprou: boolean;
    produtoCompradoId: string | null;
  } | null;
  recentEvents: LeadJourneyEvent[];
  tags: string[];
  qualificacao: unknown;
  lead_recorrente: boolean;
}

/** Result when the lead can't be located for this tenant. */
const NOT_FOUND: LeadHistoryResult = {
  found: false,
  lead: null,
  recentEvents: [],
  tags: [],
  qualificacao: {},
  lead_recorrente: false,
};

/**
 * Resolves the lead by phone within the tenant, then loads the last 20 journey
 * events (created_at DESC). Objection events (tipo='objecao') surface naturally
 * within that window. Bounded to 20 to keep the tool payload cheap.
 */
export async function buscarHistoricoLead(
  ctx: Pick<ToolContext, 'tenantId' | 'leadPhone'>
): Promise<LeadHistoryResult> {
  return withTenant(ctx.tenantId, async (tx) => {
    const [lead] = await tx
      .select({
        id: schema.leads.id,
        nome: schema.leads.nome,
        telefone: schema.leads.telefone,
        temperatura: schema.leads.temperatura,
        status: schema.leads.status,
        comprou: schema.leads.comprou,
        produtoCompradoId: schema.leads.produtoCompradoId,
        qualificacao: schema.leads.qualificacao,
        leadRecorrente: schema.leads.leadRecorrente,
      })
      .from(schema.leads)
      .where(
        and(
          eq(schema.leads.tenantId, ctx.tenantId),
          eq(schema.leads.telefone, ctx.leadPhone)
        )
      )
      .limit(1);

    if (!lead) return NOT_FOUND;

    const recentEvents = await tx
      .select({
        tipo: schema.leadJourneyEvents.tipo,
        detalhes: schema.leadJourneyEvents.detalhes,
        createdAt: schema.leadJourneyEvents.createdAt,
      })
      .from(schema.leadJourneyEvents)
      .where(
        and(
          eq(schema.leadJourneyEvents.tenantId, ctx.tenantId),
          eq(schema.leadJourneyEvents.leadId, lead.id)
        )
      )
      .orderBy(sql`${schema.leadJourneyEvents.createdAt} DESC`)
      .limit(20);

    // Segmentation tags promised in the tool description (FAQ/interest/profile).
    const tagRows = await tx
      .select({ tag: schema.leadTags.tag })
      .from(schema.leadTags)
      .where(
        and(
          eq(schema.leadTags.tenantId, ctx.tenantId),
          eq(schema.leadTags.leadId, lead.id)
        )
      );

    return {
      found: true,
      lead: {
        id: lead.id,
        nome: lead.nome,
        telefone: lead.telefone,
        temperatura: lead.temperatura,
        status: lead.status,
        comprou: lead.comprou,
        produtoCompradoId: lead.produtoCompradoId,
      },
      recentEvents: recentEvents as LeadJourneyEvent[],
      tags: tagRows.map((r) => r.tag),
      qualificacao: lead.qualificacao,
      lead_recorrente: lead.leadRecorrente,
    };
  });
}
