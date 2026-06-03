import {
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { tenants } from './tenancy.js';

export const usageCounters = pgTable(
  'usage_counters',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .references(() => tenants.id)
      .notNull(),
    /** Format: 'YYYY-MM', e.g. '2026-06' */
    periodo: text('periodo').notNull(),
    conversasUsadas: integer('conversas_usadas').notNull().default(0),
    conversasLimite: integer('conversas_limite').notNull(),
    overageConversas: integer('overage_conversas').notNull().default(0),
    overageValor: numeric('overage_valor', { precision: 10, scale: 2 }).notNull().default('0'),
    custoIaUsd: numeric('custo_ia_usd', { precision: 10, scale: 4 }).notNull().default('0'),
    /** Sent alert thresholds: ['80', '95', '100', 'overage_brl_100', ...] */
    alertasEnviados: jsonb('alertas_enviados').$type<string[]>().notNull().default([]),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  },
  (t) => [uniqueIndex('usage_counters_tenant_periodo_uniq').on(t.tenantId, t.periodo)]
);
