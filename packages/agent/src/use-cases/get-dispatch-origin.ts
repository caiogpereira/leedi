import { withTenant, schema, eq, and, inArray, gte, desc } from '@leedi/db';

/** Lookback window: a dispatch a lead is replying to was sent < this ago. */
const DISPATCH_ORIGIN_LOOKBACK_MS = 48 * 60 * 60 * 1000;

/** A template was actually delivered (vs pendente/falhou/excluido). */
const DELIVERED_STATUSES = ['enviado', 'entregue', 'respondido'] as const;

export interface DispatchOrigin {
  templateNome: string;
  /** Raw componentes.body.text; may contain {{n}} placeholders — shown as-is. */
  templateBody: string;
  /** null for recovery (dispatch_rule) targets, which have no campaign. */
  campaignNome: string | null;
  /** null when the campaign has no produtoId or the origin is rule-path. */
  produtoNome: string | null;
}

/**
 * Resolves what proactive dispatch (if any) the lead is currently replying to, so
 * the agent's system prompt can carry that origin as context.
 *
 * Read-only. Picks the lead's most recent DELIVERED dispatch target within the last
 * 48h, then resolves its template (+ campaign + product for job-path targets, or
 * template-only for recovery rule-path targets). Returns null for organic
 * conversations (no recent dispatch) — leaving their behavior unchanged.
 *
 * `now` is injectable so the 48h recency bound is deterministically testable.
 */
export async function getDispatchOrigin(
  tenantId: string,
  leadId: string,
  now: Date = new Date(),
): Promise<DispatchOrigin | null> {
  const cutoff = new Date(now.getTime() - DISPATCH_ORIGIN_LOOKBACK_MS);

  // OPTIONAL enrichment: this lookup runs on every inbound message but its result
  // is purely additive context for the prompt. `null` is already a valid degraded
  // state (organic conversation, no recent dispatch), so a DB error (timeout,
  // connection blip) must degrade the same way rather than abort the agent reply.
  // This is a deliberate non-fatal guard, not a swallowed-error smell.
  try {
    return await withTenant(tenantId, async (tx) => {
      const [target] = await tx
        .select({
          dispatchJobId: schema.dispatchTargets.dispatchJobId,
          dispatchRuleId: schema.dispatchTargets.dispatchRuleId,
        })
        .from(schema.dispatchTargets)
        .where(
          and(
            eq(schema.dispatchTargets.tenantId, tenantId),
            eq(schema.dispatchTargets.leadId, leadId),
            inArray(schema.dispatchTargets.status, [...DELIVERED_STATUSES]),
            gte(schema.dispatchTargets.enviadoEm, cutoff),
          ),
        )
        .orderBy(desc(schema.dispatchTargets.enviadoEm))
        .limit(1);

      if (!target) return null;

      // Resolve template + campaign from whichever origin the target carries.
      let templateId: string | null = null;
      let campaignId: string | null = null;

      if (target.dispatchJobId) {
        const [job] = await tx
          .select({
            templateId: schema.dispatchJobs.templateId,
            campaignId: schema.dispatchJobs.campaignId,
          })
          .from(schema.dispatchJobs)
          .where(eq(schema.dispatchJobs.id, target.dispatchJobId))
          .limit(1);
        templateId = job?.templateId ?? null;
        campaignId = job?.campaignId ?? null;
      } else if (target.dispatchRuleId) {
        const [rule] = await tx
          .select({ templateId: schema.dispatchRules.templateId })
          .from(schema.dispatchRules)
          .where(eq(schema.dispatchRules.id, target.dispatchRuleId))
          .limit(1);
        templateId = rule?.templateId ?? null;
      }

      if (!templateId) return null;

      const [template] = await tx
        .select({ nome: schema.templates.nome, componentes: schema.templates.componentes })
        .from(schema.templates)
        .where(eq(schema.templates.id, templateId))
        .limit(1);
      if (!template) return null;

      let campaignNome: string | null = null;
      let produtoNome: string | null = null;

      if (campaignId) {
        const [campaign] = await tx
          .select({ nome: schema.campaigns.nome, produtoId: schema.campaigns.produtoId })
          .from(schema.campaigns)
          .where(eq(schema.campaigns.id, campaignId))
          .limit(1);
        campaignNome = campaign?.nome ?? null;

        if (campaign?.produtoId) {
          const [product] = await tx
            .select({ nome: schema.products.nome })
            .from(schema.products)
            .where(eq(schema.products.id, campaign.produtoId))
            .limit(1);
          produtoNome = product?.nome ?? null;
        }
      }

      return {
        templateNome: template.nome,
        templateBody: template.componentes?.body?.text ?? '',
        campaignNome,
        produtoNome,
      };
    });
  } catch (error) {
    console.warn('[get-dispatch-origin] lookup failed; continuing without dispatch context', {
      tenantId,
      leadId,
      error,
    });
    return null;
  }
}
