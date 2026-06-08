import { boolean, jsonb, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { tenants } from './tenancy.js';
import { leads } from './lead.js';

// ─── Enums ──────────────────────────────────────────────────────────────────────
export const gatewayTypeEnum = pgEnum('gateway_type', ['hotmart', 'eduzz', 'kiwify']);

export const gatewayEventoCanonicoEnum = pgEnum('gateway_evento_canonico', [
  'compra_aprovada',
  'compra_recusada',
  'compra_cancelada',
  'compra_reembolsada',
  'chargeback',
  'carrinho_abandonado',
  'assinatura_iniciada',
  'assinatura_cancelada',
  'assinatura_atrasada',
  'boleto_gerado',
  'pix_gerado',
]);

// ─── gateway_integrations ──────────────────────────────────────────────────────
export const gatewayIntegrations = pgTable('gateway_integrations', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id')
    .references(() => tenants.id, { onDelete: 'cascade' })
    .notNull(),
  gateway: gatewayTypeEnum('gateway').notNull(),
  webhookSecret: text('webhook_secret').notNull(),
  webhookUrlPath: text('webhook_url_path').notNull().unique(),
  config: jsonb('config').notNull().default({}),
  ativo: boolean('ativo').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// ─── gateway_events ────────────────────────────────────────────────────────────
// Append-only event log. No updated_at trigger.
export const gatewayEvents = pgTable('gateway_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id')
    .references(() => tenants.id, { onDelete: 'cascade' })
    .notNull(),
  gateway: text('gateway').notNull(),
  eventoCanonical: gatewayEventoCanonicoEnum('evento_canonico'),
  payloadOriginal: jsonb('payload_original').notNull(),
  payloadNormalizado: jsonb('payload_normalizado').notNull().default({}),
  leadId: uuid('lead_id').references(() => leads.id, { onDelete: 'set null' }),
  processado: boolean('processado').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});
