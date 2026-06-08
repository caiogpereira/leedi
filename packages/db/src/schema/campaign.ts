import { jsonb, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { tenants } from './tenancy.js';
import { products } from './knowledge.js';

// ─── Enums ──────────────────────────────────────────────────────────────────────
export const campaignTipoEnum = pgEnum('campaign_tipo', [
  'lancamento',
  'downsell',
  'perpetuo',
]);

export const campaignFaseEnum = pgEnum('campaign_fase', [
  'aquecimento',
  'carrinho_aberto',
  'downsell',
  'encerrada',
]);

export const campaignStatusEnum = pgEnum('campaign_status', [
  'rascunho',
  'ativa',
  'pausada',
  'encerrada',
]);

// ─── PhaseConfig types ───────────────────────────────────────────────────────────
export interface PhaseTransition {
  tipo: 'manual' | 'data';
  data?: string;
  scheduledJobId?: string;
}

export interface PhaseConfig {
  urgencia?: string;
  mensagens_chave?: string[];
  transicao?: PhaseTransition;
}

export interface DownsellPhaseConfig extends PhaseConfig {
  produto_id?: string;
}

export interface CampaignConfig {
  aquecimento?: PhaseConfig;
  carrinho_aberto?: PhaseConfig;
  downsell?: DownsellPhaseConfig;
}

// ─── campaigns ────────────────────────────────────────────────────────────────────
export const campaigns = pgTable('campaigns', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id')
    .references(() => tenants.id)
    .notNull(),
  nome: text('nome').notNull(),
  produtoId: uuid('produto_id').references(() => products.id),
  tipo: campaignTipoEnum('tipo').notNull(),
  fase: campaignFaseEnum('fase').notNull().default('aquecimento'),
  dataInicio: timestamp('data_inicio', { withTimezone: true }),
  dataFim: timestamp('data_fim', { withTimezone: true }),
  status: campaignStatusEnum('status').notNull().default('rascunho'),
  config: jsonb('config').$type<CampaignConfig>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// ─── segments ─────────────────────────────────────────────────────────────────────
export const segments = pgTable('segments', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id')
    .references(() => tenants.id)
    .notNull(),
  nome: text('nome').notNull(),
  filtros: jsonb('filtros').notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});
