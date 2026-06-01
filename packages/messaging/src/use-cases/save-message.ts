import { withTenant, schema } from '@leedi/db';

export type MessageDirection = 'inbound' | 'outbound';
export type MessageAutor = 'lead' | 'agente' | 'humano' | 'sistema';
export type MessageTipo = 'texto' | 'audio' | 'imagem' | 'documento' | 'template' | 'sticker';
export type MessageStatus = 'recebido' | 'enviado' | 'entregue' | 'lido' | 'falhou';

export interface SaveMessageInput {
  tenantId: string;
  conversationWindowId: string;
  leadId: string;
  direction: MessageDirection;
  content: string;
  autor?: MessageAutor | undefined;
  tipo?: MessageTipo | undefined;
  metaMessageId?: string | undefined;
  status: MessageStatus;
  midiaUrl?: string | undefined;
  transcricao?: string | undefined;
  metadata?: Record<string, unknown> | undefined;
}

/**
 * Persists a single message linked to its conversation window and lead.
 *
 * Runs through withTenant so RLS scopes the insert to the caller's tenant.
 * The `messages` table is range-partitioned on `created_at` with PK
 * (id, created_at); selecting only `id` in RETURNING is still valid because the
 * generated id is unique within each partition for our access patterns.
 *
 * No `.onConflictDoNothing` on meta_message_id: after partitioning that column
 * is no longer globally unique, and Redis SET NX (Story 4.4) is the authoritative
 * dedup guard.
 */
export async function saveMessage(input: SaveMessageInput): Promise<string> {
  const {
    tenantId,
    conversationWindowId,
    leadId,
    direction,
    content,
    autor,
    tipo,
    metaMessageId,
    status,
    midiaUrl,
    transcricao,
    metadata,
  } = input;

  const [row] = await withTenant(tenantId, async (tx) =>
    tx
      .insert(schema.messages)
      .values({
        tenantId,
        conversationWindowId,
        leadId,
        direction,
        content,
        autor: autor ?? null,
        tipo: tipo ?? null,
        metaMessageId: metaMessageId ?? null,
        status,
        midiaUrl: midiaUrl ?? null,
        transcricao: transcricao ?? null,
        metadata: metadata ?? {},
      })
      .returning({ id: schema.messages.id })
  );

  return row!.id;
}
