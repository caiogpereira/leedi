import {
  boolean,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
  integer,
} from 'drizzle-orm/pg-core';
import { tenants } from './tenancy.js';

export const productTipoEnum = pgEnum('product_tipo', [
  'principal',
  'downsell',
  'upsell',
  'orderbump',
]);

export const products = pgTable('products', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id')
    .references(() => tenants.id)
    .notNull(),
  nome: text('nome').notNull(),
  descricao: text('descricao'),
  preco: numeric('preco').notNull(),
  parcelas: integer('parcelas'),
  precoParcelado: numeric('preco_parcelado'),
  linkCheckout: text('link_checkout').notNull(),
  tipo: productTipoEnum('tipo').default('principal').notNull(),
  argumentos: jsonb('argumentos').$type<string[]>().default([]).notNull(),
  diferenciais: jsonb('diferenciais').$type<string[]>().default([]).notNull(),
  provasSociais: jsonb('provas_sociais').$type<string[]>().default([]).notNull(),
  garantia: text('garantia'),
  bonus: jsonb('bonus').$type<string[]>().default([]).notNull(),
  gatewayProductId: text('gateway_product_id'),
  materialLancamento: text('material_lancamento'),
  ativo: boolean('ativo').default(true).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const knowledgeBaseTipoEnum = pgEnum('knowledge_base_tipo', ['faq', 'objecao']);

export const knowledgeBase = pgTable('knowledge_base', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id')
    .references(() => tenants.id)
    .notNull(),
  tipo: knowledgeBaseTipoEnum('tipo').notNull(),
  perguntaOuObjecao: text('pergunta_ou_objecao').notNull(),
  respostaOuContorno: text('resposta_ou_contorno').notNull(),
  categoria: text('categoria'),
  // embedding deferred to V2 — pgvector not enabled in this migration
  ativo: boolean('ativo').default(true).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});
