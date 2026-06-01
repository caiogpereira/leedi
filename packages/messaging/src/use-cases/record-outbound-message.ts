import { withTenant, schema, eq } from '@leedi/db';

export interface RecordOutboundMessageInput {
  tenantId: string;
  leadId: string;
  content: string;
  conversationWindowId?: string | undefined;
}

export interface OutboundMessageRecord {
  id: string;
  markSent: (metaMessageId: string) => Promise<void>;
  markFailed: (errorCode?: string) => Promise<void>;
}

/**
 * Records an outbound message (agent/system originated) in 'enviado' status and
 * returns handles to flip it to sent (with the Meta message id) or failed.
 *
 * autor defaults to 'agente'. conversationWindowId is optional so callers that
 * have not yet resolved a window can still record the row.
 */
export async function recordOutboundMessage(
  input: RecordOutboundMessageInput
): Promise<OutboundMessageRecord> {
  const { tenantId, leadId, content, conversationWindowId } = input;

  const [row] = await withTenant(tenantId, async (tx) =>
    tx
      .insert(schema.messages)
      .values({
        tenantId,
        leadId,
        content,
        conversationWindowId: conversationWindowId ?? null,
        autor: 'agente',
        direction: 'outbound',
        status: 'enviado',
      })
      .returning({ id: schema.messages.id })
  );

  const id = row!.id;

  return {
    id,
    async markSent(metaMessageId: string) {
      await withTenant(tenantId, async (tx) =>
        tx
          .update(schema.messages)
          .set({ metaMessageId, status: 'enviado' })
          .where(eq(schema.messages.id, id))
      );
    },
    async markFailed(_errorCode?: string) {
      await withTenant(tenantId, async (tx) =>
        tx
          .update(schema.messages)
          .set({ status: 'falhou' })
          .where(eq(schema.messages.id, id))
      );
    },
  };
}
