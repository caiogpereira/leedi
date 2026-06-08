import {
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { tenants } from './tenancy.js';

export const notificationCanalEnum = pgEnum('notification_canal_enum', [
  'push',
  'email',
  'whatsapp',
]);

export const notificationStatusEnum = pgEnum('notification_status_enum', [
  'pendente',
  'enviado',
  'lido',
  'falhou',
]);

export const pushSubscriptions = pgTable(
  'push_subscriptions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull(),
    tenantId: uuid('tenant_id')
      .references(() => tenants.id)
      .notNull(),
    endpoint: text('endpoint').notNull(),
    p256dh: text('p256dh').notNull(),
    auth: text('auth').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [unique().on(t.userId, t.endpoint)]
);

export const notificationPreferences = pgTable(
  'notification_preferences',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .references(() => tenants.id)
      .notNull(),
    userId: uuid('user_id').notNull(),
    canais: jsonb('canais').$type<{ push: boolean; email: boolean }>().notNull().default({ push: true, email: true }),
    eventos: jsonb('eventos').$type<Record<string, { push: boolean; email: boolean }>>().notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [unique().on(t.tenantId, t.userId)]
);

export const notifications = pgTable('notifications', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id')
    .references(() => tenants.id)
    .notNull(),
  userId: uuid('user_id').notNull(),
  tipo: text('tipo').notNull(),
  titulo: text('titulo'),
  corpo: text('corpo'),
  canal: notificationCanalEnum('canal').notNull(),
  status: notificationStatusEnum('status').notNull().default('pendente'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});
