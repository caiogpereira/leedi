import {
  boolean,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { tenants } from './tenancy.js';
import { campaigns, segments } from './campaign.js';
import { templates } from './template.js';
import { leads } from './lead.js';
import { conversationWindows } from './messaging.js';

// ─── Enums ──────────────────────────────────────────────────────────────────────
export const dispatchTipoEnum = pgEnum('dispatch_tipo', [
  'template_massa',
  'reengajamento',
  'followup_24h',
]);

export const dispatchStatusEnum = pgEnum('dispatch_status', [
  'agendado',
  'processando',
  'concluido',
  'pausado',
  'erro',
]);

export const dispatchTargetStatusEnum = pgEnum('dispatch_target_status', [
  'pendente',
  // PL-17: atomic claim state set BEFORE the send (pendente -> enviando) so a
  // redelivered/concurrent batch never re-sends an already-claimed target.
  'enviando',
  'enviado',
  'entregue',
  'respondido',
  'falhou',
  'excluido',
]);

// Includes the gateway-driven recovery triggers (carrinho_abandonado, boleto_gerado,
// pix_gerado) wired by handle-recovery-event.ts in Epic 11 PLUS the dispatch-native
// triggers (sem_resposta_48h, fim_oferta_24h). The gateway hook queries
// `dispatch_rules WHERE trigger = <eventoCanonical>` — those labels MUST exist here
// or Postgres rejects the comparison and boleto/pix recovery silently never fires.
export const dispatchRuleTriggerEnum = pgEnum('dispatch_rule_trigger', [
  'carrinho_abandonado',
  'boleto_gerado',
  'pix_gerado',
  'sem_resposta_48h',
  'fim_oferta_24h',
]);

export const followupStatusEnum = pgEnum('followup_status', [
  'agendado',
  'enviado',
  'cancelado',
  'janela_fechada',
]);

// ─── Throttle config (stored in dispatch_jobs.config_throttle) ─────────────────────
export interface DispatchThrottleConfig {
  tier?: '1k' | '10k' | '100k' | 'unlimited' | null;
  tier_interval_ms?: number;
  qstash_job_id?: string;
  paused_reason?: string;
}

// ─── dispatch_jobs ─────────────────────────────────────────────────────────────────
export const dispatchJobs = pgTable('dispatch_jobs', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id')
    .references(() => tenants.id)
    .notNull(),
  campaignId: uuid('campaign_id').references(() => campaigns.id),
  templateId: uuid('template_id').references(() => templates.id),
  segmentId: uuid('segment_id').references(() => segments.id),
  tipo: dispatchTipoEnum('tipo').notNull(),
  status: dispatchStatusEnum('status').notNull().default('agendado'),
  agendadoPara: timestamp('agendado_para', { withTimezone: true }).notNull(),
  totalAlvos: integer('total_alvos').default(0).notNull(),
  enviados: integer('enviados').default(0).notNull(),
  falhas: integer('falhas').default(0).notNull(),
  configThrottle: jsonb('config_throttle')
    .$type<DispatchThrottleConfig>()
    .notNull()
    .default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// ─── dispatch_rules ────────────────────────────────────────────────────────────────
export interface DispatchRuleJanelaTempo {
  delay_minutes?: number;
}

export const dispatchRules = pgTable('dispatch_rules', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id')
    .references(() => tenants.id)
    .notNull(),
  nome: text('nome').notNull(),
  trigger: dispatchRuleTriggerEnum('trigger').notNull(),
  templateId: uuid('template_id')
    .references(() => templates.id)
    .notNull(),
  janelaTempo: jsonb('janela_tempo')
    .$type<DispatchRuleJanelaTempo>()
    .notNull()
    .default({ delay_minutes: 60 }),
  ativo: boolean('ativo').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// ─── dispatch_targets ──────────────────────────────────────────────────────────────
export const dispatchTargets = pgTable('dispatch_targets', {
  id: uuid('id').primaryKey().defaultRandom(),
  // Nullable: recovery targets (Story 13.3) are tied to a dispatch_rule, not a job.
  dispatchJobId: uuid('dispatch_job_id').references(() => dispatchJobs.id),
  dispatchRuleId: uuid('dispatch_rule_id').references(() => dispatchRules.id),
  leadId: uuid('lead_id')
    .references(() => leads.id)
    .notNull(),
  tenantId: uuid('tenant_id').notNull(),
  status: dispatchTargetStatusEnum('status').notNull().default('pendente'),
  motivoExclusao: text('motivo_exclusao'),
  wamid: text('wamid'),
  enviadoEm: timestamp('enviado_em', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// ─── followups ─────────────────────────────────────────────────────────────────────
export const followups = pgTable('followups', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id')
    .references(() => tenants.id)
    .notNull(),
  leadId: uuid('lead_id')
    .references(() => leads.id)
    .notNull(),
  conversationWindowId: uuid('conversation_window_id')
    .references(() => conversationWindows.id)
    .notNull(),
  agendadoPara: timestamp('agendado_para', { withTimezone: true }).notNull(),
  motivo: text('motivo').notNull(),
  conteudoSugerido: text('conteudo_sugerido'),
  status: followupStatusEnum('status').notNull().default('agendado'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});
