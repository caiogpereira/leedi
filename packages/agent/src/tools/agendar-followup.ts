// Tool: agendar_followup — configurable action. Schedules a free-text follow-up
// with the lead inside the 24h service window.
//
// schema-vs-ctx boundary: Claude supplies { emHoras, motivo, conteudoSugerido? }.
// tenantId, leadId, conversationWindowId come from ToolContext.
//
// Flow:
//   1. Validate emHoras (0 < emHoras <= 23 — must land inside the 24h window).
//   2. Verify the conversation window is still open.
//   3. Insert a followups row (status='agendado').
//   4. Schedule a QStash job (/api/internal/dispatch/send-followup, delay=emHoras*3600).
//   5. Return a confirmation string.

import { withTenant, schema, eq, and, sql } from '@leedi/db';
import { Client } from '@upstash/qstash';
import { env } from '@leedi/config';
import type { ToolContext } from './types.js';

export interface AgendarFollowupInput {
  emHoras: number;
  motivo: string;
  conteudoSugerido?: string;
}

function apiBaseUrl(): string {
  return env.BETTER_AUTH_URL.replace(':3000', `:${env.API_PORT}`);
}

export async function agendarFollowup(
  input: AgendarFollowupInput,
  ctx: Pick<ToolContext, 'tenantId' | 'leadId' | 'conversationWindowId'>
): Promise<string> {
  const emHoras = Number(input.emHoras);
  if (!Number.isFinite(emHoras) || emHoras <= 0) {
    return 'Não foi possível agendar: informe um tempo positivo em horas.';
  }
  if (emHoras > 23) {
    return 'Não foi possível agendar: o follow-up deve ocorrer em até 23 horas (limite da janela de 24h).';
  }

  const agendadoPara = new Date(Date.now() + emHoras * 3600 * 1000);

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
    url: `${apiBaseUrl()}/api/internal/dispatch/send-followup`,
    delay: Math.ceil(emHoras * 3600),
    deduplicationId: `followup-${followup!.id}`,
    body: { followupId: followup!.id, tenantId: ctx.tenantId },
  });

  return `Follow-up agendado para daqui a ${emHoras} hora(s).`;
}
