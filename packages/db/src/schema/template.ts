import { boolean, jsonb, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { tenants } from './tenancy.js';
import { whatsappConnections } from './connection.js';

// ─── Enums ──────────────────────────────────────────────────────────────────────
export const templateCategoriaEnum = pgEnum('template_categoria', [
  'marketing',
  'utility',
  'authentication',
]);

export const templateStatusEnum = pgEnum('template_status', [
  'rascunho',
  'pendente',
  'aprovado',
  'rejeitado',
  'pausado',
]);

// ─── Component structure types ───────────────────────────────────────────────────
export interface TemplateHeaderComponent {
  type: 'HEADER';
  format: 'TEXT' | 'IMAGE' | 'VIDEO' | 'DOCUMENT';
  text?: string;
}

export interface TemplateBodyComponent {
  type: 'BODY';
  text: string;
}

export interface TemplateFooterComponent {
  type: 'FOOTER';
  text: string;
}

export interface TemplateButtonComponent {
  type: 'BUTTONS';
  buttons: Array<{
    type: 'URL' | 'QUICK_REPLY';
    text: string;
    url?: string;
  }>;
}

export type TemplateComponent =
  | TemplateHeaderComponent
  | TemplateBodyComponent
  | TemplateFooterComponent
  | TemplateButtonComponent;

export interface TemplateComponentes {
  header?: TemplateHeaderComponent;
  body: TemplateBodyComponent;
  footer?: TemplateFooterComponent;
  buttons?: TemplateButtonComponent;
}

export interface TemplateVariavel {
  index: number;
  exemplo: string;
}

// ─── templates ────────────────────────────────────────────────────────────────────
export const templates = pgTable('templates', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id')
    .references(() => tenants.id, { onDelete: 'cascade' })
    .notNull(),
  connectionId: uuid('connection_id').references(() => whatsappConnections.id, {
    onDelete: 'set null',
  }),
  nome: text('nome').notNull(),
  categoria: templateCategoriaEnum('categoria').notNull(),
  idioma: text('idioma').notNull().default('pt_BR'),
  componentes: jsonb('componentes').$type<TemplateComponentes>().notNull(),
  variaveis: jsonb('variaveis').$type<TemplateVariavel[]>().notNull().default([]),
  metaTemplateId: text('meta_template_id'),
  status: templateStatusEnum('status').notNull().default('rascunho'),
  motivoRejeicao: text('motivo_rejeicao'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// ─── template_library ─────────────────────────────────────────────────────────────
export const templateLibrary = pgTable('template_library', {
  id: uuid('id').primaryKey().defaultRandom(),
  categoriaOcasiao: text('categoria_ocasiao').notNull(),
  titulo: text('titulo').notNull(),
  descricao: text('descricao').notNull(),
  componentesSugeridos: jsonb('componentes_sugeridos').$type<TemplateComponentes>().notNull(),
  isGlobal: boolean('is_global').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});
