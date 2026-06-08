// Tool: transferir_humano — configurable action (Story 7.6).
//
// Hands the conversation off to a human operator. On call it:
//   1. Loads the lead (nome + temperatura) for the handoff summary + notification.
//   2. Generates an operator handoff summary with Claude Haiku (AC#1, AC#2).
//   3. Upserts inbox_assignments to status='aguardando_humano', idempotent on
//      conversation_window_id (AC#1) — there is NO DB UNIQUE constraint on that
//      column, so dedup is enforced in-app (same precedent as adicionar-tag.ts).
//   4. Sends the lead the EXACT literal handoff message over WhatsApp and persists
//      it to messages with autor='agente' (AC#1).
//   5. Emits an operator notification via injected dep (real delivery in Epic 18) (AC#3).
//   6. Pauses the agent thread via @leedi/agent-memory.updateThreadStatus (the tool
//      NEVER touches agent_threads directly).
//
// schema-vs-ctx boundary: Claude supplies { motivo, conversationSummary }. The
// identity/transport fields come from ToolContext.

import Anthropic from '@anthropic-ai/sdk';
import { withTenant, schema, eq, and } from '@leedi/db';
import { MetaCloudProvider } from '@leedi/connection';
import { updateThreadStatus } from '@leedi/agent-memory';
import { buildHandoffPrompt } from '../utils/build-handoff-prompt.js';
import { modelIdForTask } from '../config/model-routing.js';
import type { ToolContext } from './types.js';

const HANDOFF_MODEL = modelIdForTask('handoff_summary');

/** The literal message the lead reads — must be sent verbatim (AC#1). */
const HANDOFF_LEAD_MESSAGE =
  'Vou te conectar com um de nossos especialistas. Um momento!';

export interface TransferirHumanoInput {
  motivo: string;
  conversationSummary: string;
}

export interface TransferirHumanoResult {
  transferred: true;
  assignmentId: string;
}

/** WhatsApp sender shape (kept minimal so tests can inject a mock). */
export interface HumanTransferSender {
  sendText: (to: string, body: string) => Promise<{ messageId: string }>;
}

export interface TransferirHumanoDeps {
  /** Anthropic client for the Haiku handoff summary (defaults to a fresh client). */
  anthropic?: Pick<Anthropic, 'messages'>;
  /** Builds a WhatsApp sender from a connection record (defaults to MetaCloudProvider). */
  senderFactory?: (record: {
    phoneNumberId: string;
    wabaId: string;
    accessTokenEncrypted: string;
    accessTokenIv: string;
  }) => HumanTransferSender;
  /** Sends the lead_pediu_humano notification to tenant operators. Injected to keep
   *  @leedi/notification out of the agent package's import graph (avoids config mock issues
   *  in tests). Defaults to the real sendNotificationToTenantRole at call time. */
  notifyOperators?: (tenantId: string, leadName: string) => Promise<void>;
}

export async function transferirHumano(
  input: TransferirHumanoInput,
  ctx: ToolContext,
  deps: TransferirHumanoDeps = {}
): Promise<TransferirHumanoResult> {
  const { motivo, conversationSummary } = input;
  const { tenantId, leadId, leadPhone, connectionId, threadId, conversationWindowId } = ctx;

  const { leadName, temperatura, connection } = await withTenant(tenantId, async (tx) => {
    const [lead] = await tx
      .select({ nome: schema.leads.nome, temperatura: schema.leads.temperatura })
      .from(schema.leads)
      .where(and(eq(schema.leads.tenantId, tenantId), eq(schema.leads.id, leadId)))
      .limit(1);

    const [conn] = await tx
      .select({
        phoneNumberId: schema.whatsappConnections.phoneNumberId,
        wabaId: schema.whatsappConnections.wabaId,
        accessTokenEncrypted: schema.whatsappConnections.accessTokenEncrypted,
        accessTokenIv: schema.whatsappConnections.accessTokenIv,
      })
      .from(schema.whatsappConnections)
      .where(
        and(
          eq(schema.whatsappConnections.tenantId, tenantId),
          eq(schema.whatsappConnections.id, connectionId)
        )
      )
      .limit(1);

    return {
      leadName: lead?.nome ?? leadPhone ?? 'Lead',
      temperatura: lead?.temperatura ?? 'frio',
      connection: conn ?? {
        phoneNumberId: '',
        wabaId: '',
        accessTokenEncrypted: '',
        accessTokenIv: '',
      },
    };
  });

  const resumoHandoff = await generateHandoffSummary(
    buildHandoffPrompt({ leadName, temperatura, motivo, conversationSummary }),
    deps.anthropic
  );

  const assignmentId = await withTenant(tenantId, async (tx) => {
    const [existing] = await tx
      .select({ id: schema.inboxAssignments.id })
      .from(schema.inboxAssignments)
      .where(eq(schema.inboxAssignments.conversationWindowId, conversationWindowId))
      .limit(1);

    if (existing) {
      await tx
        .update(schema.inboxAssignments)
        .set({
          status: 'aguardando_humano',
          resumoHandoff,
          motivoHandoff: motivo,
          updatedAt: new Date(),
        })
        .where(eq(schema.inboxAssignments.id, existing.id));
      return existing.id;
    }

    const [inserted] = await tx
      .insert(schema.inboxAssignments)
      .values({
        tenantId,
        conversationWindowId,
        status: 'aguardando_humano',
        resumoHandoff,
        motivoHandoff: motivo,
      })
      .returning({ id: schema.inboxAssignments.id });

    return inserted?.id ?? '';
  });

  const senderFactory = deps.senderFactory ?? defaultSenderFactory;
  const sender = senderFactory(connection);

  let metaMessageId: string | null = null;
  let status: 'enviado' | 'falhou' = 'enviado';
  try {
    const res = await sender.sendText(leadPhone, HANDOFF_LEAD_MESSAGE);
    metaMessageId = res.messageId;
  } catch {
    status = 'falhou';
  }

  await withTenant(tenantId, async (tx) =>
    tx.insert(schema.messages).values({
      tenantId,
      conversationWindowId,
      leadId,
      direction: 'outbound',
      autor: 'agente',
      tipo: 'texto',
      content: HANDOFF_LEAD_MESSAGE,
      metaMessageId,
      status,
    })
  );

  await withTenant(tenantId, async (tx) =>
    tx.insert(schema.leadJourneyEvents).values({
      tenantId,
      leadId,
      tipo: 'handoff',
      detalhes: { tipo: 'lead_pediu_humano', leadName, tenantId },
    })
  );

  // Notify operators via injected dep (default: real sendNotificationToTenantRole).
  // Dynamic import keeps @leedi/notification out of the agent package's eager load.
  const notifyFn = deps.notifyOperators ?? defaultNotifyOperators;
  notifyFn(tenantId, leadName).catch(() => {});

  await updateThreadStatus(tenantId, threadId, 'pausado');

  return { transferred: true, assignmentId };
}

async function generateHandoffSummary(
  prompt: string,
  client?: Pick<Anthropic, 'messages'>
): Promise<string> {
  const anthropic = client ?? new Anthropic();
  const res = await anthropic.messages.create({
    model: HANDOFF_MODEL,
    max_tokens: 512,
    messages: [{ role: 'user', content: prompt }],
  });

  const block = res.content.find((b) => b.type === 'text');
  return block && 'text' in block ? block.text.trim() : '';
}

function defaultSenderFactory(record: {
  phoneNumberId: string;
  wabaId: string;
  accessTokenEncrypted: string;
  accessTokenIv: string;
}): HumanTransferSender {
  return new MetaCloudProvider(record);
}

async function defaultNotifyOperators(tenantId: string, leadName: string): Promise<void> {
  // Dynamic import keeps @leedi/notification out of the agent package's eager import graph.
  const { sendNotificationToTenantRole } = await import('@leedi/notification');
  await sendNotificationToTenantRole({
    tenantId,
    roles: ['owner', 'admin', 'operator'],
    tipo: 'lead_pediu_humano',
    titulo: 'Lead aguardando atendimento',
    corpo: `Lead aguardando: ${leadName}`,
  });
}
