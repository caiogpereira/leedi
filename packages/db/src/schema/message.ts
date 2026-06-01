import { jsonb, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { tenants } from './tenancy.js';

// Keep existing enums — direction/status stay as English (project convention)
export const messageDirectionEnum = pgEnum('message_direction', ['inbound', 'outbound']);

export const messageStatusEnum = pgEnum('message_status', [
  'recebido',
  'enviado',
  'entregue',
  'lido',
  'falhou',
]);

// New enums for Story 5.5 reconcile
export const messageAutorEnum = pgEnum('message_autor', ['lead', 'agente', 'humano', 'sistema']);

export const messageTipoEnum = pgEnum('message_tipo', [
  'texto',
  'audio',
  'imagem',
  'documento',
  'template',
  'sticker',
]);

// Reconciled messages schema (Story 5.5).
// NOTE: the actual DB table is PARTITIONED BY RANGE (created_at) — see migration 0006.
// Drizzle models it as a normal table; the PK in the DB is (id, created_at) to include
// the partition key, but Drizzle only sees `id` for query composition purposes.
// The old `lead_phone` and `conversation_id` columns are removed; `lead_id` and
// `conversation_window_id` replace them.
export const messages = pgTable('messages', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id')
    .references(() => tenants.id)
    .notNull(),
  // Nullable until resolveConversationWindow is called in the inbound flow
  conversationWindowId: uuid('conversation_window_id'),
  // Nullable until findOrCreateLeadByPhone is called
  leadId: uuid('lead_id'),
  direction: messageDirectionEnum('direction').notNull(),
  autor: messageAutorEnum('autor'),
  tipo: messageTipoEnum('tipo'),
  content: text('content').notNull(),
  midiaUrl: text('midia_url'),
  transcricao: text('transcricao'),
  // NOTE: meta_message_id is NOT declared unique here — after partitioning the DB
  // enforces UNIQUE(meta_message_id, created_at) per partition, not globally.
  // Redis SET NX is the authoritative dedup guard (Story 4.4).
  metaMessageId: text('meta_message_id'),
  status: messageStatusEnum('status').notNull(),
  metadata: jsonb('metadata').default({}).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});
