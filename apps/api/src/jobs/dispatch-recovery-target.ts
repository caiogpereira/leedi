// Story 13.3 — dispatch-recovery-target QStash handler.
//
// Fired (with a rule-configured delay) by handle-recovery-event after a recovery
// gateway event (carrinho_abandonado / boleto_gerado / pix_gerado). Sends the
// rule's approved template to the lead, recording a dispatch_targets row that
// captures the outcome (sent / excluded / failed). Idempotent via a 24h dedup
// window keyed on (lead, rule).

import { withTenant, schema, eq, and, sql, inArray } from '@leedi/db';
import { MetaCloudProvider } from '@leedi/connection';
import { captureException } from '@leedi/observability';

export interface DispatchRecoveryTargetPayload {
  leadId: string;
  dispatchRuleId: string;
  tenantId: string;
  gatewayEventId?: string;
}

export async function dispatchRecoveryTarget(
  payload: DispatchRecoveryTargetPayload
): Promise<{ skipped: boolean; reason?: string; status?: string }> {
  const { leadId, dispatchRuleId, tenantId } = payload;

  // Dedup: a SUCCESSFUL target for this (lead, rule) in the last 24h → skip.
  // Only successful sends count: a prior 'falhou'/'excluido' row must not block a
  // legitimate retry for 24h.
  const recent = await withTenant(tenantId, async (tx) =>
    tx
      .select({ id: schema.dispatchTargets.id })
      .from(schema.dispatchTargets)
      .where(
        and(
          eq(schema.dispatchTargets.tenantId, tenantId),
          eq(schema.dispatchTargets.leadId, leadId),
          eq(schema.dispatchTargets.dispatchRuleId, dispatchRuleId),
          inArray(schema.dispatchTargets.status, ['enviado', 'entregue', 'respondido']),
          sql`${schema.dispatchTargets.createdAt} > now() - interval '24 hours'`
        )
      )
      .limit(1)
  );
  if (recent[0]) return { skipped: true, reason: 'dedup' };

  // Load rule + template + lead + connection.
  const ctx = await withTenant(tenantId, async (tx) => {
    const [rule] = await tx
      .select({
        id: schema.dispatchRules.id,
        ativo: schema.dispatchRules.ativo,
        templateId: schema.dispatchRules.templateId,
      })
      .from(schema.dispatchRules)
      .where(and(eq(schema.dispatchRules.tenantId, tenantId), eq(schema.dispatchRules.id, dispatchRuleId)))
      .limit(1);

    if (!rule) return { rule: null as null };

    const [template] = await tx
      .select({ nome: schema.templates.nome, status: schema.templates.status })
      .from(schema.templates)
      .where(eq(schema.templates.id, rule.templateId))
      .limit(1);

    const [lead] = await tx
      .select({
        telefone: schema.leads.telefone,
        status: schema.leads.status,
        comprou: schema.leads.comprou,
      })
      .from(schema.leads)
      .where(and(eq(schema.leads.tenantId, tenantId), eq(schema.leads.id, leadId)))
      .limit(1);

    const [connection] = await tx
      .select({
        phoneNumberId: schema.whatsappConnections.phoneNumberId,
        wabaId: schema.whatsappConnections.wabaId,
        accessTokenEncrypted: schema.whatsappConnections.accessTokenEncrypted,
        accessTokenIv: schema.whatsappConnections.accessTokenIv,
        qualityRating: schema.whatsappConnections.qualityRating,
      })
      .from(schema.whatsappConnections)
      .where(eq(schema.whatsappConnections.tenantId, tenantId))
      .limit(1);

    return { rule, template, lead, connection };
  });

  if (!ctx.rule) return { skipped: true, reason: 'rule_not_found' };
  if (!ctx.rule.ativo) return { skipped: true, reason: 'rule_inactive' };

  // Helper: persist a target row with a given outcome.
  const recordTarget = async (
    status: 'enviado' | 'falhou' | 'excluido',
    extra: { motivoExclusao?: string; wamid?: string } = {}
  ) => {
    await withTenant(tenantId, async (tx) => {
      await tx.insert(schema.dispatchTargets).values({
        dispatchJobId: null, // recovery targets aren't tied to a job
        dispatchRuleId,
        leadId,
        tenantId,
        status,
        motivoExclusao: extra.motivoExclusao ?? null,
        wamid: extra.wamid ?? null,
        enviadoEm: status === 'enviado' ? new Date() : null,
      });
    });
  };

  // Template must be aprovado.
  if (ctx.template?.status !== 'aprovado') {
    await recordTarget('falhou', { motivoExclusao: 'template_nao_aprovado' });
    return { skipped: false, status: 'falhou', reason: 'template_nao_aprovado' };
  }

  // Quality gate: a RED number cannot send.
  if (ctx.connection?.qualityRating === 'vermelho') {
    await recordTarget('falhou', { motivoExclusao: 'quality_red' });
    return { skipped: false, status: 'falhou', reason: 'quality_red' };
  }

  // Lead exclusions.
  if (!ctx.lead) return { skipped: true, reason: 'lead_not_found' };
  if (ctx.lead.status === 'optout') {
    await recordTarget('excluido', { motivoExclusao: 'optout' });
    return { skipped: false, status: 'excluido', reason: 'optout' };
  }
  if (ctx.lead.comprou === true) {
    await recordTarget('excluido', { motivoExclusao: 'ja_comprou' });
    return { skipped: false, status: 'excluido', reason: 'ja_comprou' };
  }

  if (!ctx.connection) {
    await recordTarget('falhou', { motivoExclusao: 'sem_conexao' });
    return { skipped: false, status: 'falhou', reason: 'sem_conexao' };
  }

  // Send the template.
  try {
    const provider = new MetaCloudProvider(ctx.connection);
    const { messageId } = await provider.sendTemplate(ctx.lead.telefone, ctx.template.nome, []);
    await recordTarget('enviado', { wamid: messageId });
    return { skipped: false, status: 'enviado' };
  } catch (err) {
    // Transient send error: re-throw so QStash retries. Recording a 'falhou' row
    // here would both pollute counters and (with the success-only dedup) is
    // unnecessary — the retry will re-evaluate from scratch.
    captureException(err as Error);
    throw err;
  }
}
