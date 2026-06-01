import {
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
  boolean,
  jsonb,
  unique,
} from 'drizzle-orm/pg-core';
import { tenants } from './tenancy.js';

export const leadTemperaturaEnum = pgEnum('lead_temperatura', ['frio', 'morno', 'quente']);

export const leadStatusEnum = pgEnum('lead_status', ['ativo', 'optout', 'bloqueado']);

export const leadTagOrigemEnum = pgEnum('lead_tag_origem', ['manual', 'agente']);

export const leads = pgTable(
  'leads',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .references(() => tenants.id)
      .notNull(),
    // E.164 format (e.g. "+5511999999999")
    telefone: text('telefone').notNull(),
    nome: text('nome'),
    email: text('email'),
    origem: text('origem'),
    temperatura: leadTemperaturaEnum('temperatura').default('frio').notNull(),
    status: leadStatusEnum('status').default('ativo').notNull(),
    comprou: boolean('comprou').default(false).notNull(),
    // No FK — products table does not exist yet (wired in a later epic)
    produtoCompradoId: uuid('produto_comprado_id'),
    dataCompra: timestamp('data_compra', { withTimezone: true }),
    primeiraInteracao: timestamp('primeira_interacao', { withTimezone: true }),
    ultimaInteracao: timestamp('ultima_interacao', { withTimezone: true }),
    qualificacao: jsonb('qualificacao').default({}).notNull(),
    leadRecorrente: boolean('lead_recorrente').default(false).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [unique('leads_tenant_id_telefone_unique').on(t.tenantId, t.telefone)]
);

export const leadTags = pgTable('lead_tags', {
  id: uuid('id').primaryKey().defaultRandom(),
  leadId: uuid('lead_id')
    .references(() => leads.id, { onDelete: 'cascade' })
    .notNull(),
  tenantId: uuid('tenant_id').notNull(),
  tag: text('tag').notNull(),
  origemTag: leadTagOrigemEnum('origem_tag').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const leadJourneyEvents = pgTable('lead_journey_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  leadId: uuid('lead_id')
    .references(() => leads.id, { onDelete: 'cascade' })
    .notNull(),
  tenantId: uuid('tenant_id').notNull(),
  tipo: text('tipo').notNull(),
  detalhes: jsonb('detalhes').default({}).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});
