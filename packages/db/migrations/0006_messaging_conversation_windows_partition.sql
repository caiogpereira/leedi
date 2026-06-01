-- Story 5.5: conversation_windows, inbox_assignments, messages reconcile + partition
-- SAFE: messages table was verified empty before this migration.

-- ─── New enums ──────────────────────────────────────────────────────────────────
CREATE TYPE "public"."meta_category" AS ENUM('marketing', 'utility', 'authentication', 'service');
CREATE TYPE "public"."inbox_status" AS ENUM('bot', 'aguardando_humano', 'em_atendimento', 'resolvido');
CREATE TYPE "public"."message_autor" AS ENUM('lead', 'agente', 'humano', 'sistema');
CREATE TYPE "public"."message_tipo" AS ENUM('texto', 'audio', 'imagem', 'documento', 'template', 'sticker');

-- ─── conversation_windows ───────────────────────────────────────────────────────
CREATE TABLE "conversation_windows" (
  "id"                    uuid                     DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id"             uuid                     NOT NULL,
  "lead_id"               uuid                     NOT NULL,
  "connection_id"         uuid                     NOT NULL,
  "started_at"            timestamp with time zone NOT NULL,
  "ended_at"              timestamp with time zone,
  "message_count"         integer                  DEFAULT 0 NOT NULL,
  "billable"              boolean                  DEFAULT true NOT NULL,
  "meta_conversation_id"  text,
  "meta_category"         "meta_category",
  "created_at"            timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "conversation_windows_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "conversation_windows"
  ADD CONSTRAINT "conversation_windows_tenant_id_fk"
  FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;

ALTER TABLE "conversation_windows"
  ADD CONSTRAINT "conversation_windows_lead_id_fk"
  FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE no action ON UPDATE no action;

ALTER TABLE "conversation_windows"
  ADD CONSTRAINT "conversation_windows_connection_id_fk"
  FOREIGN KEY ("connection_id") REFERENCES "public"."whatsapp_connections"("id") ON DELETE no action ON UPDATE no action;

ALTER TABLE "conversation_windows" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "conversation_windows" FORCE ROW LEVEL SECURITY;
CREATE POLICY "conversation_windows_tenant_isolation" ON "conversation_windows"
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- ─── inbox_assignments ──────────────────────────────────────────────────────────
CREATE TABLE "inbox_assignments" (
  "id"                       uuid                     DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id"                uuid                     NOT NULL,
  "conversation_window_id"   uuid                     NOT NULL,
  "assigned_to"              uuid,
  "status"                   "inbox_status"           DEFAULT 'bot' NOT NULL,
  "resumo_handoff"           text,
  "motivo_handoff"           text,
  "created_at"               timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at"               timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "inbox_assignments_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "inbox_assignments"
  ADD CONSTRAINT "inbox_assignments_conversation_window_id_fk"
  FOREIGN KEY ("conversation_window_id") REFERENCES "public"."conversation_windows"("id") ON DELETE cascade ON UPDATE no action;

ALTER TABLE "inbox_assignments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "inbox_assignments" FORCE ROW LEVEL SECURITY;
CREATE POLICY "inbox_assignments_tenant_isolation" ON "inbox_assignments"
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

CREATE TRIGGER inbox_assignments_set_updated_at
  BEFORE UPDATE ON "inbox_assignments"
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─── messages: drop old + recreate as partitioned ───────────────────────────────
-- The old table had: id, tenant_id, conversation_id (nullable), direction, content,
-- meta_message_id (unique), lead_phone (nullable), status, created_at, updated_at.
-- It is EMPTY — verified with SELECT count(*) before applying this migration.
-- Reconciled schema adds: lead_id, conversation_window_id, autor, tipo, midia_url,
-- transcricao, metadata. Removes: lead_phone, conversation_id (old name).
-- PK becomes (id, created_at) — required for all partitioned table constraints.

DROP TABLE "messages";

CREATE TABLE "messages" (
  "id"                       uuid                     DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id"                uuid                     NOT NULL,
  "conversation_window_id"   uuid,
  "lead_id"                  uuid,
  "direction"                "message_direction"      NOT NULL,
  "autor"                    "message_autor",
  "tipo"                     "message_tipo",
  "content"                  text                     NOT NULL,
  "midia_url"                text,
  "transcricao"              text,
  "meta_message_id"          text,
  "status"                   "message_status"         NOT NULL,
  "metadata"                 jsonb                    DEFAULT '{}'::jsonb NOT NULL,
  "created_at"               timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at"               timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "messages_pkey" PRIMARY KEY ("id", "created_at")
) PARTITION BY RANGE ("created_at");

-- NOTE: (meta_message_id, created_at) is NOT a global unique — same meta_message_id
-- with a different created_at could insert twice. Redis SET NX (Story 4.4) is the
-- authoritative dedup guard. This index only speeds up lookups within a partition.
CREATE UNIQUE INDEX "messages_meta_message_id_idx"
  ON "messages" ("meta_message_id", "created_at")
  WHERE "meta_message_id" IS NOT NULL;

ALTER TABLE "messages"
  ADD CONSTRAINT "messages_tenant_id_fk"
  FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;

ALTER TABLE "messages"
  ADD CONSTRAINT "messages_conversation_window_id_fk"
  FOREIGN KEY ("conversation_window_id") REFERENCES "public"."conversation_windows"("id") ON DELETE no action ON UPDATE no action;

ALTER TABLE "messages"
  ADD CONSTRAINT "messages_lead_id_fk"
  FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE no action ON UPDATE no action;

-- Initial monthly partitions (current month + 2 ahead)
CREATE TABLE "messages_2026_06" PARTITION OF "messages"
  FOR VALUES FROM ('2026-06-01') TO ('2026-07-01');

CREATE TABLE "messages_2026_07" PARTITION OF "messages"
  FOR VALUES FROM ('2026-07-01') TO ('2026-08-01');

CREATE TABLE "messages_2026_08" PARTITION OF "messages"
  FOR VALUES FROM ('2026-08-01') TO ('2026-09-01');

-- RLS on partitioned parent — applies to all queries via parent table
ALTER TABLE "messages" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "messages" FORCE ROW LEVEL SECURITY;
CREATE POLICY "messages_tenant_isolation" ON "messages"
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- updated_at trigger — inherited by all current and future partitions
CREATE TRIGGER messages_set_updated_at
  BEFORE UPDATE ON "messages"
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
