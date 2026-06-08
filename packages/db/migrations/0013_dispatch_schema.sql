-- Epic 13 (Stories 13.1–13.5): Smart Message Dispatch
-- dispatch_jobs + dispatch_rules + dispatch_targets + followups
-- set_updated_at() was created in migration 0004 — do NOT redefine it.
-- dispatch_targets + followups are effectively append-only (no updated_at trigger).

-- ─── Enums ──────────────────────────────────────────────────────────────────────
CREATE TYPE "public"."dispatch_tipo" AS ENUM('template_massa', 'reengajamento', 'followup_24h');

CREATE TYPE "public"."dispatch_status" AS ENUM(
  'agendado',
  'processando',
  'concluido',
  'pausado',
  'erro'
);

CREATE TYPE "public"."dispatch_target_status" AS ENUM(
  'pendente',
  'enviado',
  'entregue',
  'respondido',
  'falhou',
  'excluido'
);

CREATE TYPE "public"."dispatch_rule_trigger" AS ENUM(
  'carrinho_abandonado',
  'boleto_gerado',
  'pix_gerado',
  'sem_resposta_48h',
  'fim_oferta_24h'
);

CREATE TYPE "public"."followup_status" AS ENUM(
  'agendado',
  'enviado',
  'cancelado',
  'janela_fechada'
);

-- ─── dispatch_jobs ─────────────────────────────────────────────────────────────
CREATE TABLE "dispatch_jobs" (
  "id"              uuid        DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id"       uuid        NOT NULL,
  "campaign_id"     uuid,
  "template_id"     uuid,
  "segment_id"      uuid,
  "tipo"            "dispatch_tipo" NOT NULL,
  "status"          "dispatch_status" NOT NULL DEFAULT 'agendado',
  "agendado_para"   timestamptz NOT NULL,
  "total_alvos"     integer     NOT NULL DEFAULT 0,
  "enviados"        integer     NOT NULL DEFAULT 0,
  "falhas"          integer     NOT NULL DEFAULT 0,
  "config_throttle" jsonb       NOT NULL DEFAULT '{}',
  "created_at"      timestamptz DEFAULT now() NOT NULL,
  "updated_at"      timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "dispatch_jobs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "dispatch_jobs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id"),
  CONSTRAINT "dispatch_jobs_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id"),
  CONSTRAINT "dispatch_jobs_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "templates"("id"),
  CONSTRAINT "dispatch_jobs_segment_id_fkey" FOREIGN KEY ("segment_id") REFERENCES "segments"("id")
);

ALTER TABLE "dispatch_jobs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "dispatch_jobs" FORCE ROW LEVEL SECURITY;

CREATE POLICY "dispatch_jobs_tenant_isolation" ON "dispatch_jobs"
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

CREATE TRIGGER "dispatch_jobs_updated_at"
  BEFORE UPDATE ON "dispatch_jobs"
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX "dispatch_jobs_tenant_status_idx" ON "dispatch_jobs" ("tenant_id", "status");

-- ─── dispatch_rules ────────────────────────────────────────────────────────────
CREATE TABLE "dispatch_rules" (
  "id"           uuid        DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id"    uuid        NOT NULL,
  "nome"         text        NOT NULL,
  "trigger"      "dispatch_rule_trigger" NOT NULL,
  "template_id"  uuid        NOT NULL,
  "janela_tempo" jsonb       NOT NULL DEFAULT '{"delay_minutes":60}',
  "ativo"        boolean     NOT NULL DEFAULT false,
  "created_at"   timestamptz DEFAULT now() NOT NULL,
  "updated_at"   timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "dispatch_rules_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "dispatch_rules_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id"),
  CONSTRAINT "dispatch_rules_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "templates"("id")
);

ALTER TABLE "dispatch_rules" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "dispatch_rules" FORCE ROW LEVEL SECURITY;

CREATE POLICY "dispatch_rules_tenant_isolation" ON "dispatch_rules"
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

CREATE TRIGGER "dispatch_rules_updated_at"
  BEFORE UPDATE ON "dispatch_rules"
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX "dispatch_rules_tenant_trigger_idx" ON "dispatch_rules" ("tenant_id", "trigger", "ativo");

-- ─── dispatch_targets ──────────────────────────────────────────────────────────
CREATE TABLE "dispatch_targets" (
  "id"               uuid        DEFAULT gen_random_uuid() NOT NULL,
  "dispatch_job_id"  uuid,
  "dispatch_rule_id" uuid,
  "lead_id"          uuid        NOT NULL,
  "tenant_id"        uuid        NOT NULL,
  "status"           "dispatch_target_status" NOT NULL DEFAULT 'pendente',
  "motivo_exclusao"  text,
  "wamid"            text,
  "enviado_em"       timestamptz,
  "created_at"       timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "dispatch_targets_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "dispatch_targets_dispatch_job_id_fkey" FOREIGN KEY ("dispatch_job_id") REFERENCES "dispatch_jobs"("id"),
  CONSTRAINT "dispatch_targets_dispatch_rule_id_fkey" FOREIGN KEY ("dispatch_rule_id") REFERENCES "dispatch_rules"("id"),
  CONSTRAINT "dispatch_targets_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id")
);

ALTER TABLE "dispatch_targets" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "dispatch_targets" FORCE ROW LEVEL SECURITY;

CREATE POLICY "dispatch_targets_tenant_isolation" ON "dispatch_targets"
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

CREATE INDEX "dispatch_targets_job_status_idx" ON "dispatch_targets" ("dispatch_job_id", "status");
CREATE INDEX "dispatch_targets_dedup_idx" ON "dispatch_targets" ("lead_id", "dispatch_rule_id", "created_at");

-- ─── followups ─────────────────────────────────────────────────────────────────
CREATE TABLE "followups" (
  "id"                     uuid        DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id"              uuid        NOT NULL,
  "lead_id"                uuid        NOT NULL,
  "conversation_window_id" uuid        NOT NULL,
  "agendado_para"          timestamptz NOT NULL,
  "motivo"                 text        NOT NULL,
  "conteudo_sugerido"      text,
  "status"                 "followup_status" NOT NULL DEFAULT 'agendado',
  "created_at"             timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "followups_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "followups_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id"),
  CONSTRAINT "followups_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id"),
  CONSTRAINT "followups_conversation_window_id_fkey" FOREIGN KEY ("conversation_window_id") REFERENCES "conversation_windows"("id")
);

ALTER TABLE "followups" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "followups" FORCE ROW LEVEL SECURITY;

CREATE POLICY "followups_tenant_isolation" ON "followups"
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

CREATE INDEX "followups_status_idx" ON "followups" ("tenant_id", "status");
