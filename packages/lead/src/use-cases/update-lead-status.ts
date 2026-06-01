import { withTenant, schema, eq, and, sql } from '@leedi/db';
import { isUuid } from './is-uuid.js';

export type LeadStatusChange = 'optout' | 'ativo';

export interface UpdateLeadStatusInput {
  tenantId: string;
  leadId: string;
  status: LeadStatusChange;
  operadorId: string;
}

/**
 * Changes a lead's status and records the corresponding journey event in ONE
 * transaction (data-integrity requirement of AC3/AC5): the status flip and the
 * audit event either both land or neither does.
 *
 * status === 'optout'  -> tipo 'optout',   detalhes { origem: 'manual', operador_id }
 * status === 'ativo'   -> tipo 'reativado', detalhes { operador_id }
 *
 * `operadorId` is supplied by the API from the session, never the request body.
 * `detalhes` keys are snake_case to match the journey-event convention.
 *
 * Returns false when no lead matched the tenant-scoped UPDATE (caller maps to
 * 404); true when the change was applied. The journey event is only inserted
 * when the UPDATE matched a row, so we never write an audit event for a
 * non-existent lead.
 */
export async function updateLeadStatus(input: UpdateLeadStatusInput): Promise<boolean> {
  // A malformed (non-UUID) leadId never matches a row; short-circuit to the
  // not-found signal instead of letting Postgres throw on an invalid uuid.
  if (!isUuid(input.leadId)) {
    return false;
  }

  const tipo = input.status === 'optout' ? 'optout' : 'reativado';
  const detalhes =
    input.status === 'optout'
      ? { origem: 'manual', operador_id: input.operadorId }
      : { operador_id: input.operadorId };

  return withTenant(input.tenantId, async (tx) => {
    const updated = await tx
      .update(schema.leads)
      .set({ status: input.status, updatedAt: sql`now()` })
      .where(and(eq(schema.leads.id, input.leadId), eq(schema.leads.tenantId, input.tenantId)))
      .returning({ id: schema.leads.id });

    if (updated.length === 0) {
      return false;
    }

    await tx.insert(schema.leadJourneyEvents).values({
      leadId: input.leadId,
      tenantId: input.tenantId,
      tipo,
      detalhes,
    });

    return true;
  });
}
