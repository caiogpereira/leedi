// Tool: marcar_intencao_compra — always-on action. Records that the lead showed
// strong purchase intent: heats the lead to 'quente' and logs a journey event.
//
// schema-vs-ctx boundary: Claude supplies ONLY the optional `productId`. tenantId
// and leadId come from ToolContext.
//
// Flow (AC#2):
//   1. UPDATE leads SET temperatura = 'quente' WHERE id = leadId.
//   2. INSERT lead_journey_events { tipo: 'interesse', detalhes: { produto_id, agente_id } }.
//   3. Return { updated: true }.

import { withTenant, schema, eq, and } from '@leedi/db';
import type { ToolContext } from './types.js';

export interface MarcarIntencaoCompraInput {
  productId?: string;
}

export interface MarcarIntencaoCompraResult {
  updated: boolean;
}

/**
 * Flags purchase intent for the current lead. Both the temperature update and the
 * journey-event insert run in one tenant-scoped transaction (RLS, atomicity).
 * The journey event's `agente_id` is the literal 'agent' until per-agent identity
 * lands in a later epic.
 */
export async function marcarIntencaoCompra(
  input: MarcarIntencaoCompraInput,
  ctx: Pick<ToolContext, 'tenantId' | 'leadId'>
): Promise<MarcarIntencaoCompraResult> {
  await withTenant(ctx.tenantId, async (tx) => {
    await tx
      .update(schema.leads)
      .set({ temperatura: 'quente' })
      .where(
        and(eq(schema.leads.tenantId, ctx.tenantId), eq(schema.leads.id, ctx.leadId))
      );

    await tx.insert(schema.leadJourneyEvents).values({
      tenantId: ctx.tenantId,
      leadId: ctx.leadId,
      tipo: 'interesse',
      detalhes: { produto_id: input.productId ?? null, agente_id: 'agent' },
    });
  });

  return { updated: true };
}
