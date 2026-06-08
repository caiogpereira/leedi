import {
  boolean,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { tenants } from './tenancy.js';
import { salesMethods } from './sales-method.js';
import { leads } from './lead.js';
import { conversationWindows } from './messaging.js';

// ─── Enums ──────────────────────────────────────────────────────────────────────
export const agentModeloIaEnum = pgEnum('agent_modelo_ia', ['sonnet', 'haiku', 'opus']);
export const agentThreadStatusEnum = pgEnum('agent_thread_status', ['ativo', 'pausado', 'encerrado']);
export const agentMessageRoleEnum = pgEnum('agent_message_role', [
  'system',
  'user',
  'assistant',
  'tool',
]);

// Strongly-typed shapes for the jsonb config columns.
export interface EstiloMensagem {
  tamanho: 'curto' | 'medio' | 'longo';
  formalidade: 'formal' | 'informal';
  emoji: boolean;
}

// Only CONFIGURABLE tools live here. Always-on tools (buscar_historico_lead,
// consultar_ofertas_ativas, verificar_elegibilidade, enviar_link_checkout,
// marcar_intencao_compra) are NOT toggles and are not stored.
export interface ToolsHabilitadas {
  consultar_base_conhecimento: boolean;
  agendar_followup: boolean;
  transferir_humano: boolean;
  adicionar_tag: boolean;
  solicitar_reengajamento: boolean;
}

// ─── agent_configs ────────────────────────────────────────────────────────────────
// Per-tenant control surface for the agent. One config per tenant (UNIQUE tenant_id).
export const agentConfigs = pgTable('agent_configs', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id')
    .references(() => tenants.id)
    .notNull()
    .unique(),
  nomeAgente: text('nome_agente').default('Assistente').notNull(),
  persona: text('persona').default('').notNull(),
  estiloMensagem: jsonb('estilo_mensagem')
    .$type<EstiloMensagem>()
    .default({ tamanho: 'medio', formalidade: 'informal', emoji: true })
    .notNull(),
  limites: text('limites').default('').notNull(),
  // Nullable: tenant may not have picked a method yet.
  salesMethodId: uuid('sales_method_id').references(() => salesMethods.id),
  modeloIa: agentModeloIaEnum('modelo_ia').default('sonnet').notNull(),
  toolsHabilitadas: jsonb('tools_habilitadas')
    .$type<ToolsHabilitadas>()
    .default({
      consultar_base_conhecimento: false,
      agendar_followup: false,
      transferir_humano: false,
      adicionar_tag: false,
      solicitar_reengajamento: false,
    })
    .notNull(),
  ativo: boolean('ativo').default(true).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// ─── agent_threads (agent-memory; PARTITIONED BY RANGE created_at) ─────────────────
// NOTE: the actual DB table is PARTITIONED BY RANGE (created_at) — see migration 0009.
// Drizzle only models a single-column `id` PK for query composition; the DB PK is the
// composite (id, created_at), required for all partitioned-table constraints.
// Owned exclusively by @leedi/agent-memory (Story 7.2). Not touched by this story's API/UI.
export const agentThreads = pgTable('agent_threads', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id')
    .references(() => tenants.id)
    .notNull(),
  leadId: uuid('lead_id').references(() => leads.id),
  conversationWindowId: uuid('conversation_window_id').references(() => conversationWindows.id),
  status: agentThreadStatusEnum('status').default('ativo').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// ─── agent_messages (agent-memory; PARTITIONED BY RANGE created_at) ────────────────
// DB PK is composite (id, created_at). No FK thread_id → agent_threads.id — the parent's
// unique key is composite, making a naive cross-partition FK illegal. Thread linkage is
// enforced at the application layer (@leedi/agent-memory is the sole writer).
export const agentMessages = pgTable('agent_messages', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id')
    .references(() => tenants.id)
    .notNull(),
  threadId: uuid('thread_id').notNull(),
  role: agentMessageRoleEnum('role').notNull(),
  // Anthropic SDK message content format.
  content: jsonb('content').notNull(),
  tokensInput: integer('tokens_input'),
  tokensOutput: integer('tokens_output'),
  modelo: text('modelo'),
  custoUsd: numeric('custo_usd'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// ─── agent_tool_calls (agent-memory; NOT partitioned) ──────────────────────────────
// No cross-partition FKs to agent_messages/agent_threads — integrity enforced at the
// application layer (those parents have composite PKs). Plain uuid PK.
export const agentToolCalls = pgTable('agent_tool_calls', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id')
    .references(() => tenants.id)
    .notNull(),
  threadId: uuid('thread_id').notNull(),
  messageId: uuid('message_id'),
  toolName: text('tool_name').notNull(),
  input: jsonb('input'),
  output: jsonb('output'),
  duracaoMs: integer('duracao_ms'),
  erro: text('erro'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});
