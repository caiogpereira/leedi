import { withTenant, schema } from '@leedi/db';

export interface RecordInboundMessageInput {
  tenantId: string;
  leadId: string;
  conversationWindowId: string;
  content: string;
  metaMessageId: string;
}

/**
 * Persists an inbound text message linked to its lead + conversation window.
 *
 * Dedup is handled upstream by Redis SET NX (Story 4.4); after partitioning,
 * meta_message_id is no longer globally unique, so there is no DB-level conflict
 * backstop here. autor/tipo default to a plain inbound text message.
 */
export async function recordInboundMessage(input: RecordInboundMessageInput): Promise<string> {
  const { tenantId, leadId, conversationWindowId, content, metaMessageId } = input;

  const [row] = await withTenant(tenantId, async (tx) =>
    tx
      .insert(schema.messages)
      .values({
        tenantId,
        leadId,
        conversationWindowId,
        content,
        metaMessageId,
        autor: 'lead',
        tipo: 'texto',
        direction: 'inbound',
        status: 'recebido',
      })
      .returning({ id: schema.messages.id })
  );

  return row?.id ?? '';
}
