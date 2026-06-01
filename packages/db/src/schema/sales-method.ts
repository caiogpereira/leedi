import { boolean, jsonb, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const salesMethodNomeEnum = pgEnum('sales_method_nome', [
  'spin',
  'aida',
  'storytelling',
  'livre',
]);

export const salesMethods = pgTable('sales_methods', {
  id: uuid('id').primaryKey().defaultRandom(),
  nome: salesMethodNomeEnum('nome').notNull(),
  titulo: text('titulo').notNull(),
  descricao: text('descricao').notNull(),
  systemPromptTemplate: text('system_prompt_template').notNull(),
  phases: jsonb('phases').$type<Array<{ ordem: number; nome: string; objetivo: string }>>().notNull(),
  isGlobal: boolean('is_global').default(false).notNull(),
  // null for global methods; set for future per-tenant custom methods
  tenantId: uuid('tenant_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  // No updated_at — sales methods are immutable once seeded (Architecture §6.7)
});
