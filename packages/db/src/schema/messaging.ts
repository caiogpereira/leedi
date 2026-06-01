import { boolean, integer, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { tenants } from './tenancy.js';
import { leads } from './lead.js';
import { whatsappConnections } from './connection.js';

export const metaCategoryEnum = pgEnum('meta_category', [
  'marketing',
  'utility',
  'authentication',
  'service',
]);

export const inboxStatusEnum = pgEnum('inbox_status', [
  'bot',
  'aguardando_humano',
  'em_atendimento',
  'resolvido',
]);

export const conversationWindows = pgTable('conversation_windows', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id')
    .references(() => tenants.id)
    .notNull(),
  leadId: uuid('lead_id')
    .references(() => leads.id)
    .notNull(),
  connectionId: uuid('connection_id')
    .references(() => whatsappConnections.id)
    .notNull(),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
  endedAt: timestamp('ended_at', { withTimezone: true }),
  messageCount: integer('message_count').default(0).notNull(),
  billable: boolean('billable').default(true).notNull(),
  metaConversationId: text('meta_conversation_id'),
  metaCategory: metaCategoryEnum('meta_category'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const inboxAssignments = pgTable('inbox_assignments', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull(),
  conversationWindowId: uuid('conversation_window_id')
    .references(() => conversationWindows.id, { onDelete: 'cascade' })
    .notNull(),
  assignedTo: uuid('assigned_to'),
  status: inboxStatusEnum('status').default('bot').notNull(),
  resumoHandoff: text('resumo_handoff'),
  motivoHandoff: text('motivo_handoff'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});
