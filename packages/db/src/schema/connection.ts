import { pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { tenants } from './tenancy.js';

export const whatsappConnectionStatusEnum = pgEnum('whatsapp_connection_status', [
  'conectado',
  'erro',
  'desconectado',
]);

export const whatsappQualityRatingEnum = pgEnum('whatsapp_quality_rating', [
  'verde',
  'amarelo',
  'vermelho',
]);

export const whatsappMessagingTierEnum = pgEnum('whatsapp_messaging_tier', [
  '1k',
  '10k',
  '100k',
  'unlimited',
]);

export const whatsappConnections = pgTable('whatsapp_connections', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id')
    .references(() => tenants.id)
    .notNull()
    .unique(),
  phoneNumberId: text('phone_number_id').notNull(),
  wabaId: text('waba_id').notNull(),
  // Envelope-encrypted token: see packages/connection/src/adapters/crypto.ts for byte layout
  accessTokenEncrypted: text('access_token_encrypted').notNull(),
  accessTokenIv: text('access_token_iv').notNull(),
  status: whatsappConnectionStatusEnum('status').default('desconectado').notNull(),
  qualityRating: whatsappQualityRatingEnum('quality_rating'),
  messagingTier: whatsappMessagingTierEnum('messaging_tier'),
  displayName: text('display_name'),
  lastHealthCheckAt: timestamp('last_health_check_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});
