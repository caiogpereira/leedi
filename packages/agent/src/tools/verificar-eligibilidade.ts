// Tool: verificar_elegibilidade — always-on read. Decides whether a lead may be
// offered a specific product before the agent sends a checkout link.
//
// schema-vs-ctx boundary: Claude supplies ONLY `productId`. tenantId, leadId and
// the optional campaignPhase come from ToolContext.
//
// Decision order (first match wins):
//   1. already_purchased — lead.comprou && lead.produto_comprado_id === productId.
//      Checks BOTH fields: a lead who bought a DIFFERENT product is still eligible.
//   2. campaign_closed   — active campaign phase is 'encerrada'.
//   3. campaign_phase     — phase is set but the product is out of phase scope
//      (e.g. asking for a non-downsell product while in 'downsell').
//   4. eligible           — otherwise (this is the evergreen path when no
//      campaignPhase is injected).

import { withTenant, schema, eq, and } from '@leedi/db';
import type { CampaignPhase, ToolContext } from './types.js';

export type EligibilityReason = 'already_purchased' | 'campaign_closed' | 'campaign_phase';

export interface EligibilityResult {
  eligible: boolean;
  reason?: EligibilityReason;
}

export interface VerificarElegibilidadeInput {
  productId: string;
}

/**
 * Returns whether the lead is eligible for `productId`, considering prior
 * purchase and (when present) the active campaign phase. Reads the lead's
 * purchase fields and the product's `tipo` via withTenant.
 */
export async function verificarElegibilidade(
  input: VerificarElegibilidadeInput,
  ctx: Pick<ToolContext, 'tenantId' | 'leadId' | 'campaignPhase'>
): Promise<EligibilityResult> {
  return withTenant(ctx.tenantId, async (tx) => {
    const [lead] = await tx
      .select({
        comprou: schema.leads.comprou,
        produtoCompradoId: schema.leads.produtoCompradoId,
      })
      .from(schema.leads)
      .where(
        and(eq(schema.leads.tenantId, ctx.tenantId), eq(schema.leads.id, ctx.leadId))
      )
      .limit(1);

    // AC#2 — already bought THIS product.
    if (lead?.comprou === true && lead.produtoCompradoId === input.productId) {
      return { eligible: false, reason: 'already_purchased' };
    }

    const phase = ctx.campaignPhase;

    // No active campaign → evergreen: eligible (subject only to the purchase check).
    if (!phase) {
      return { eligible: true };
    }

    // Campaign closed → nothing is sellable.
    if (phase === 'encerrada') {
      return { eligible: false, reason: 'campaign_closed' };
    }

    // Phase-scoped: the product must match the phase's offer type.
    const [product] = await tx
      .select({ tipo: schema.products.tipo })
      .from(schema.products)
      .where(
        and(
          eq(schema.products.tenantId, ctx.tenantId),
          eq(schema.products.id, input.productId)
        )
      )
      .limit(1);

    if (product && !productMatchesPhase(product.tipo, phase)) {
      return { eligible: false, reason: 'campaign_phase' };
    }

    return { eligible: true };
  });
}

/** Maps a campaign phase to the product `tipo` it sells. */
function productMatchesPhase(tipo: string, phase: CampaignPhase): boolean {
  switch (phase) {
    case 'carrinho_aberto':
      return tipo === 'principal';
    case 'downsell':
      return tipo === 'downsell';
    default:
      return true;
  }
}
