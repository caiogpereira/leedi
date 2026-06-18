// Tool: agendar_followup — configurable action. Schedules a free-text follow-up
// with the lead inside the 24h service window.
//
// schema-vs-ctx boundary: Claude supplies { agendado_para, motivo, conteudoSugerido? }.
// tenantId, leadId, conversationWindowId come from ToolContext.
//
// Flow:
//   1. Validate agendado_para (ISO 8601; future; <= 23h from now — inside the 24h window).
//   2. Verify the conversation window is still open.
//   3. Insert a followups row (status='agendado').
//   4. Schedule a QStash job (/api/internal/dispatch/send-followup, delay=agendado_para-now).
//   5. Return a confirmation string.

import { withTenant, schema, eq, and, sql } from '@leedi/db';
import { Client } from '@upstash/qstash';
import { env } from '@leedi/config';
import { apiPublicUrl } from './api-url.js';
import type { ToolContext } from './types.js';

export interface AgendarFollowupInput {
  /** ISO 8601 datetime; must fall inside the active 24h window (<= 23h from now). */
  agendado_para: string;
  motivo: string;
  conteudoSugerido?: string;
}

/** Hard limit: must land inside the active 24h window (kept at 23h for safety margin). */
const MAX_WINDOW_MS = 23 * 3600 * 1000;
const WINDOW_ERROR = 'O follow-up deve ser agendado dentro da janela de 24 horas ativa.';

export async function agendarFollowup(
  input: AgendarFollowupInput,
  ctx: Pick<ToolContext, 'tenantId' | 'leadId' | 'conversationWindowId'>
): Promise<string> {
  const agendadoPara = new Date(input.agendado_para);
  if (Number.isNaN(agendadoPara.getTime())) {
    return 'Não foi possível agendar: data/hora inválida (use o formato ISO 8601).';
  }
  const delayMs = agendadoPara.getTime() - Date.now();
  // Must be in the future AND inside the active 24h window.
  if (delayMs <= 0 || delayMs > MAX_WINDOW_MS) {
    return WINDOW_ERROR;
  }

  // Verify the conversation window is still open.
  const windowRows = await withTenant(ctx.tenantId, async (tx) =>
    tx
      .select({
        id: schema.conversationWindows.id,
        endedAt: schema.conversationWindows.endedAt,
        startedAt: schema.conversationWindows.startedAt,
      })
      .from(schema.conversationWindows)
      .where(
        and(
          eq(schema.conversationWindows.tenantId, ctx.tenantId),
          eq(schema.conversationWindows.id, ctx.conversationWindowId),
          sql`${schema.conversationWindows.endedAt} IS NULL`,
          sql`${schema.conversationWindows.startedAt} > now() - interval '24 hours'`
        )
      )
      .limit(1)
  );
  if (!windowRows[0]) {
    return 'Não foi possível agendar: a janela de conversa de 24h já está fechada.';
  }

  // Insert the followup row.
  const [followup] = await withTenant(ctx.tenantId, async (tx) =>
    tx
      .insert(schema.followups)
      .values({
        tenantId: ctx.tenantId,
        leadId: ctx.leadId,
        conversationWindowId: ctx.conversationWindowId,
        agendadoPara,
        motivo: input.motivo,
        conteudoSugerido: input.conteudoSugerido ?? null,
        status: 'agendado',
      })
      .returning({ id: schema.followups.id })
  );

  // Schedule the QStash send-followup job.
  const qstash = new Client({ token: env.QSTASH_TOKEN });
  await qstash.publishJSON({
    url: `${apiPublicUrl()}/api/internal/dispatch/send-followup`,
    delay: Math.ceil(delayMs / 1000),
    deduplicationId: `followup-${followup!.id}`,
    body: { followupId: followup!.id, tenantId: ctx.tenantId },
  });

  return `Follow-up agendado para ${agendadoPara.toISOString()}.`;
}
