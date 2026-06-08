-- Story 11.1: gateway_integrations + gateway_events tables
-- set_updated_at() was created in migration 0004 — do NOT redefine it.
-- gateway_events is append-only: no updated_at trigger.

-- ─── Enums ──────────────────────────────────────────────────────────────────────
CREATE TYPE "public"."gateway_type" AS ENUM('hotmart', 'eduzz', 'kiwify');

CREATE TYPE "public"."gateway_evento_canonico" AS ENUM(
  'compra_aprovada',
  'compra_recusada',
  'compra_cancelada',
  'compra_reembolsada',
  'chargeback',
  'carrinho_abandonado',
  'assinatura_iniciada',
  'assinatura_cancelada',
  'assinatura_atrasada',
  'boleto_gerado',
  'pix_gerado'
);

-- ─── gateway_integrations ──────────────────────────────────────────────────────
CREATE TABLE "gateway_integrations" (
  "id"               uuid        DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id"        uuid        NOT NULL,
  "gateway"          "gateway_type" NOT NULL,
  "webhook_secret"   text        NOT NULL,
  "webhook_url_path" text        NOT NULL,
  "config"           jsonb       NOT NULL DEFAULT '{}',
  "ativo"            boolean     NOT NULL DEFAULT true,
  "created_at"       timestamptz DEFAULT now() NOT NULL,
  "updated_at"       timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "gateway_integrations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "gateway_integrations_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE,
  CONSTRAINT "gateway_integrations_webhook_url_path_unique" UNIQUE ("webhook_url_path")
);

ALTER TABLE "gateway_integrations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "gateway_integrations" FORCE ROW LEVEL SECURITY;

CREATE POLICY "gateway_integrations_tenant_isolation" ON "gateway_integrations"
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

CREATE TRIGGER "gateway_integrations_updated_at"
  BEFORE UPDATE ON "gateway_integrations"
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─── gateway_events ────────────────────────────────────────────────────────────
CREATE TABLE "gateway_events" (
  "id"                   uuid        DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id"            uuid        NOT NULL,
  "gateway"              text        NOT NULL,
  "evento_canonico"      "gateway_evento_canonico",
  "payload_original"     jsonb       NOT NULL,
  "payload_normalizado"  jsonb       NOT NULL DEFAULT '{}',
  "lead_id"              uuid,
  "processado"           boolean     NOT NULL DEFAULT false,
  "created_at"           timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "gateway_events_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "gateway_events_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE,
  CONSTRAINT "gateway_events_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE SET NULL
);

ALTER TABLE "gateway_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "gateway_events" FORCE ROW LEVEL SECURITY;

CREATE POLICY "gateway_events_tenant_isolation" ON "gateway_events"
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
