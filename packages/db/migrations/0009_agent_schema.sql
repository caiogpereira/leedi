-- Story 7.1: agent_configs + agent-memory tables (agent_threads, agent_messages, agent_tool_calls)
-- ALL four tables ship in ONE migration to avoid schema drift (story dev notes).
-- set_updated_at() was created in migration 0004 — do NOT redefine it.
--
-- PARTITIONING (Postgres 11+ trap, see story pitfalls):
--   * agent_threads and agent_messages are PARTITION BY RANGE (created_at).
--   * A PK / unique constraint on a partitioned table MUST include every partition-key
--     column, so their PK is COMPOSITE (id, created_at). A plain `id uuid primary key`
--     would FAIL at migration time.
--   * Knock-on: a naive FK `agent_messages.thread_id -> agent_threads(id)` is ILLEGAL
--     because the referenced unique key is now composite. DECISION (V1): drop the
--     cross-partition FKs and enforce thread/message linkage at the application layer.
--     @leedi/agent-memory (Story 7.2) is the sole writer of the memory tables.
--   * agent_tool_calls is NOT partitioned (plain uuid PK).
--   * RLS is set on the partitioned PARENT only — it applies to all partitions
--     (mirrors migration 0006 for `messages`).

-- ─── Enums ──────────────────────────────────────────────────────────────────────
CREATE TYPE "public"."agent_modelo_ia" AS ENUM('sonnet', 'haiku', 'opus');
CREATE TYPE "public"."agent_thread_status" AS ENUM('ativo', 'pausado', 'encerrado');
CREATE TYPE "public"."agent_message_role" AS ENUM('system', 'user', 'assistant', 'tool');

-- ─── agent_configs ────────────────────────────────────────────────────────────────
-- Per-tenant control surface. UNIQUE(tenant_id) enforces one config per tenant.
CREATE TABLE "agent_configs" (
  "id"                  uuid                     DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id"           uuid                     NOT NULL,
  "nome_agente"         text                     DEFAULT 'Assistente' NOT NULL,
  "persona"             text                     DEFAULT '' NOT NULL,
  "estilo_mensagem"     jsonb                    DEFAULT '{"tamanho":"medio","formalidade":"informal","emoji":true}'::jsonb NOT NULL,
  "limites"             text                     DEFAULT '' NOT NULL,
  "sales_method_id"     uuid,
  "modelo_ia"           "agent_modelo_ia"        DEFAULT 'sonnet' NOT NULL,
  "tools_habilitadas"   jsonb                    DEFAULT '{"consultar_base_conhecimento":false,"agendar_followup":false,"transferir_humano":false,"adicionar_tag":false,"solicitar_reengajamento":false}'::jsonb NOT NULL,
  "ativo"               boolean                  DEFAULT true NOT NULL,
  "created_at"          timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at"          timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "agent_configs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "agent_configs_tenant_id_unique" UNIQUE ("tenant_id")
);

ALTER TABLE "agent_configs"
  ADD CONSTRAINT "agent_configs_tenant_id_fk"
  FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;

ALTER TABLE "agent_configs"
  ADD CONSTRAINT "agent_configs_sales_method_id_fk"
  FOREIGN KEY ("sales_method_id") REFERENCES "public"."sales_methods"("id") ON DELETE no action ON UPDATE no action;

ALTER TABLE "agent_configs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "agent_configs" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "agent_configs"
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

CREATE TRIGGER set_agent_configs_updated_at
  BEFORE UPDATE ON "agent_configs"
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─── agent_threads (PARTITION BY RANGE created_at) ─────────────────────────────────
CREATE TABLE "agent_threads" (
  "id"                       uuid                     DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id"                uuid                     NOT NULL,
  "lead_id"                  uuid,
  "conversation_window_id"   uuid,
  "status"                   "agent_thread_status"    DEFAULT 'ativo' NOT NULL,
  "created_at"               timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at"               timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "agent_threads_pkey" PRIMARY KEY ("id", "created_at")
) PARTITION BY RANGE ("created_at");

-- FKs to simple-PK parents are legal (0006 proves it for conversation_windows/messages).
ALTER TABLE "agent_threads"
  ADD CONSTRAINT "agent_threads_tenant_id_fk"
  FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;

ALTER TABLE "agent_threads"
  ADD CONSTRAINT "agent_threads_lead_id_fk"
  FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE no action ON UPDATE no action;

ALTER TABLE "agent_threads"
  ADD CONSTRAINT "agent_threads_conversation_window_id_fk"
  FOREIGN KEY ("conversation_window_id") REFERENCES "public"."conversation_windows"("id") ON DELETE no action ON UPDATE no action;

-- Initial monthly partitions (current month + 2 ahead) — matches `messages` in 0006.
CREATE TABLE "agent_threads_2026_06" PARTITION OF "agent_threads"
  FOR VALUES FROM ('2026-06-01') TO ('2026-07-01');
CREATE TABLE "agent_threads_2026_07" PARTITION OF "agent_threads"
  FOR VALUES FROM ('2026-07-01') TO ('2026-08-01');
CREATE TABLE "agent_threads_2026_08" PARTITION OF "agent_threads"
  FOR VALUES FROM ('2026-08-01') TO ('2026-09-01');

-- RLS on the partitioned parent — applies to all current and future partitions.
ALTER TABLE "agent_threads" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "agent_threads" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "agent_threads"
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- updated_at trigger — inherited by all current and future partitions.
CREATE TRIGGER set_agent_threads_updated_at
  BEFORE UPDATE ON "agent_threads"
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─── agent_messages (PARTITION BY RANGE created_at) ────────────────────────────────
-- No FK thread_id -> agent_threads.id (composite parent key — illegal). App-layer linkage.
CREATE TABLE "agent_messages" (
  "id"             uuid                     DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id"      uuid                     NOT NULL,
  "thread_id"      uuid                     NOT NULL,
  "role"           "agent_message_role"     NOT NULL,
  "content"        jsonb                    NOT NULL,
  "tokens_input"   integer,
  "tokens_output"  integer,
  "modelo"         text,
  "custo_usd"      numeric,
  "created_at"     timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "agent_messages_pkey" PRIMARY KEY ("id", "created_at")
) PARTITION BY RANGE ("created_at");

ALTER TABLE "agent_messages"
  ADD CONSTRAINT "agent_messages_tenant_id_fk"
  FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;

CREATE TABLE "agent_messages_2026_06" PARTITION OF "agent_messages"
  FOR VALUES FROM ('2026-06-01') TO ('2026-07-01');
CREATE TABLE "agent_messages_2026_07" PARTITION OF "agent_messages"
  FOR VALUES FROM ('2026-07-01') TO ('2026-08-01');
CREATE TABLE "agent_messages_2026_08" PARTITION OF "agent_messages"
  FOR VALUES FROM ('2026-08-01') TO ('2026-09-01');

ALTER TABLE "agent_messages" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "agent_messages" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "agent_messages"
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- ─── agent_tool_calls (NOT partitioned) ────────────────────────────────────────────
-- No cross-partition FKs to agent_messages/agent_threads — integrity at the app layer.
CREATE TABLE "agent_tool_calls" (
  "id"            uuid                     DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id"     uuid                     NOT NULL,
  "thread_id"     uuid                     NOT NULL,
  "message_id"    uuid,
  "tool_name"     text                     NOT NULL,
  "input"         jsonb,
  "output"        jsonb,
  "duracao_ms"    integer,
  "erro"          text,
  "created_at"    timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "agent_tool_calls_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "agent_tool_calls"
  ADD CONSTRAINT "agent_tool_calls_tenant_id_fk"
  FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;

ALTER TABLE "agent_tool_calls" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "agent_tool_calls" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "agent_tool_calls"
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
