// Story 13.4 — send-followup QStash handler.
//
// Fires at the scheduled follow-up time. If the lead already converted, cancels.
// If the 24h conversation window is still open, sends the free-text follow-up.
// If the window has closed, marks janela_fechada and falls back to a re-engagement
// dispatch rule (if one is active).

import { withTenant, schema, eq, and, sql } from '@leedi/db';
import { Client } from '@upstash/qstash';
import { env } from '@leedi/config';
import { apiPublicUrl } from '../utils/api-public-url.js';
import { MetaCloudProvider } from '@leedi/connection';
import { captureException } from '@leedi/observability';

export interface SendFollowupPayload {
  followupId: string;
  tenantId: string;
}

const DEFAULT_FOLLOWUP_MESSAGE =
  'Oi! Passando para retomar nossa conversa. Posso te ajudar com mais alguma coisa?';

export async function sendFollowup(
  payload: SendFollowupPayload
): Promise<{ skipped: boolean; status?: string; reason?: string }> {
  const { followupId, tenantId } = payload;

  const ctx = await withTenant(tenantId, async (tx) => {
    const [followup] = await tx
      .select({
        id: schema.followups.id,
        status: schema.followups.status,
        leadId: schema.followups.leadId,
        conversationWindowId: schema.followups.conversationWindowId,
        conteudoSugerido: schema.followups.conteudoSugerido,
      })
      .from(schema.followups)
      .where(and(eq(schema.followups.tenantId, tenantId), eq(schema.followups.id, followupId)))
      .limit(1);

    if (!followup) return { followup: null as null };

    const [lead] = await tx
      .select({ telefone: schema.leads.telefone, comprou: schema.leads.comprou })
      .from(schema.leads)
      .where(and(eq(schema.leads.tenantId, tenantId), eq(schema.leads.id, followup.leadId)))
      .limit(1);

    const [window] = await tx
      .select({ id: schema.conversationWindows.id })
      .from(schema.conversationWindows)
      .where(
        and(
          eq(schema.conversationWindows.tenantId, tenantId),
          eq(schema.conversationWindows.id, followup.conversationWindowId),
          sql`${schema.conversationWindows.endedAt} IS NULL`,
          sql`${schema.conversationWindows.startedAt} > now() - interval '24 hours'`
        )
      )
      .limit(1);

    const [connection] = await tx
      .select({
        phoneNumberId: schema.whatsappConnections.phoneNumberId,
        wabaId: schema.whatsappConnections.wabaId,
        accessTokenEncrypted: schema.whatsappConnections.accessTokenEncrypted,
        accessTokenIv: schema.whatsappConnections.accessTokenIv,
      })
      .from(schema.whatsappConnections)
      .where(eq(schema.whatsappConnections.tenantId, tenantId))
      .limit(1);

    return { followup, lead, windowOpen: !!window, connection };
  });

  if (!ctx.followup) return { skipped: true, reason: 'followup_not_found' };
  if (ctx.followup.status !== 'agendado') return { skipped: true, reason: 'not_agendado' };

  const setStatus = async (status: 'enviado' | 'cancelado' | 'janela_fechada') => {
    await withTenant(tenantId, async (tx) => {
      await tx
        .update(schema.followups)
        .set({ status })
        .where(eq(schema.followups.id, followupId));
    });
  };

  // Lead already converted → cancel.
  if (ctx.lead?.comprou === true) {
    await setStatus('cancelado');
    return { skipped: false, status: 'cancelado', reason: 'lead_convertido' };
  }

  // Window open → send free text.
  if (ctx.windowOpen && ctx.lead && ctx.connection) {
    try {
      const provider = new MetaCloudProvider(ctx.connection);
      const body = ctx.followup.conteudoSugerido?.trim() || DEFAULT_FOLLOWUP_MESSAGE;
      const { messageId } = await provider.sendText(ctx.lead.telefone, body);
      // Mark sent IMMEDIATELY after the send succeeds: the status guard above
      // short-circuits a redelivery, so a failure in the bookkeeping below must
      // not re-send the free-text message to the lead.
      await setStatus('enviado');
      try {
        await withTenant(tenantId, async (tx) => {
          await tx.insert(schema.messages).values({
            tenantId,
            conversationWindowId: ctx.followup!.conversationWindowId,
            leadId: ctx.followup!.leadId,
            direction: 'outbound',
            autor: 'agente',
            tipo: 'texto',
            content: body,
            metaMessageId: messageId,
            status: 'enviado',
          });
        });
      } catch (insertErr) {
        // Best-effort persistence — the message was already delivered.
        captureException(insertErr as Error);
      }
      return { skipped: false, status: 'enviado' };
    } catch (err) {
      captureException(err as Error);
      throw err; // the send itself failed → surface as 5xx so QStash retries
    }
  }

  // Window closed → mark and fall back to a re-engagement rule.
  await setStatus('janela_fechada');

  const rules = await withTenant(tenantId, async (tx) =>
    tx
      .select({ id: schema.dispatchRules.id })
      .from(schema.dispatchRules)
      .where(and(eq(schema.dispatchRules.tenantId, tenantId), eq(schema.dispatchRules.ativo, true)))
      .limit(1)
  );

  if (rules[0] && ctx.followup) {
    const qstash = new Client({ token: env.QSTASH_TOKEN });
    await qstash
      .publishJSON({
        url: `${apiPublicUrl()}/api/internal/gateway/dispatch-recovery-target`,
        delay: 0,
        body: { leadId: ctx.followup.leadId, dispatchRuleId: rules[0].id, tenantId },
      })
      .catch(captureException);
  }

  return { skipped: false, status: 'janela_fechada' };
}
