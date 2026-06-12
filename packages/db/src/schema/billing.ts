import { sql } from 'drizzle-orm';
import {
  boolean,
  date,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { tenants } from './tenancy.js';

export const billingPlanEnum = pgEnum('billing_plan_enum', ['starter', 'pro', 'enterprise']);
export const billingStatusEnum = pgEnum('billing_status_enum', [
  'ativa',
  'atrasada',
  'cancelada',
  'trial',
]);
export const invoiceStatusEnum = pgEnum('invoice_status_enum', [
  'pendente',
  'pago',
  'atrasado',
  'cancelado',
]);

export const subscriptions = pgTable('subscriptions', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id')
    .references(() => tenants.id)
    .notNull(),
  asaasCustomerId: text('asaas_customer_id'),
  asaasSubscriptionId: text('asaas_subscription_id'),
  plano: billingPlanEnum('plano').notNull(),
  valor: numeric('valor').notNull(),
  ciclo: text('ciclo').notNull().default('mensal'),
  status: billingStatusEnum('status').notNull().default('ativa'),
  proximoVencimento: date('proximo_vencimento'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const invoices = pgTable('invoices', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id')
    .references(() => tenants.id)
    .notNull(),
  subscriptionId: uuid('subscription_id').references(() => subscriptions.id),
  asaasPaymentId: text('asaas_payment_id'),
  valor: numeric('valor'),
  vencimento: date('vencimento'),
  pagoPem: timestamp('pago_em', { withTimezone: true }),
  status: invoiceStatusEnum('status').notNull().default('pendente'),
  incluiOverage: boolean('inclui_overage').notNull().default(false),
  valorOverage: numeric('valor_overage').notNull().default('0'),
  receiptUrl: text('receipt_url'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  // Idempotency guard for Asaas payment webhooks (Story 17.2). Partial because
  // asaas_payment_id is nullable; ON CONFLICT targets this index.
  asaasPaymentIdUnique: uniqueIndex('invoices_asaas_payment_id_unique')
    .on(table.asaasPaymentId)
    .where(sql`${table.asaasPaymentId} IS NOT NULL`),
}));
