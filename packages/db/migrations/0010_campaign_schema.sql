-- Story 10.1: campaigns + segments tables
-- set_updated_at() was created in migration 0004 — do NOT redefine it.
-- Partial unique index on campaigns(tenant_id) WHERE status = 'ativa' enforces
-- the single-active-campaign-per-tenant invariant at the DB level.

-- ─── Enums ──────────────────────────────────────────────────────────────────────
CREATE TYPE "public"."campaign_tipo" AS ENUM('lancamento', 'downsell', 'perpetuo');
CREATE TYPE "public"."campaign_fase" AS ENUM('aquecimento', 'carrinho_aberto', 'downsell', 'encerrada');
CREATE TYPE "public"."campaign_status" AS ENUM('rascunho', 'ativa', 'pausada', 'encerrada');

-- ─── campaigns ────────────────────────────────────────────────────────────────────
CREATE TABLE "campaigns" (
  "id"          uuid      DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id"   uuid      NOT NULL,
  "nome"        text      NOT NULL,
  "produto_id"  uuid,
  "tipo"        "campaign_tipo"    NOT NULL,
  "fase"        "campaign_fase"    NOT NULL DEFAULT 'aquecimento',
  "data_inicio" timestamptz,
  "data_fim"    timestamptz,
  "status"      "campaign_status"  NOT NULL DEFAULT 'rascunho',
  "config"      jsonb     NOT NULL DEFAULT '{}',
  "created_at"  timestamptz DEFAULT now() NOT NULL,
  "updated_at"  timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "campaigns_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "campaigns_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE,
  CONSTRAINT "campaigns_produto_id_fkey" FOREIGN KEY ("produto_id") REFERENCES "products"("id") ON DELETE SET NULL
);

-- Single active campaign per tenant (enforced at DB level)
CREATE UNIQUE INDEX "campaigns_tenant_active_unique"
  ON "campaigns" ("tenant_id")
  WHERE status = 'ativa';

ALTER TABLE "campaigns" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "campaigns" FORCE ROW LEVEL SECURITY;

CREATE POLICY "campaigns_tenant_isolation" ON "campaigns"
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

CREATE TRIGGER "campaigns_updated_at"
  BEFORE UPDATE ON "campaigns"
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─── segments ─────────────────────────────────────────────────────────────────────
CREATE TABLE "segments" (
  "id"          uuid      DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id"   uuid      NOT NULL,
  "nome"        text      NOT NULL,
  "filtros"     jsonb     NOT NULL DEFAULT '{}',
  "created_at"  timestamptz DEFAULT now() NOT NULL,
  "updated_at"  timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "segments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "segments_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE
);

ALTER TABLE "segments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "segments" FORCE ROW LEVEL SECURITY;

CREATE POLICY "segments_tenant_isolation" ON "segments"
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

CREATE TRIGGER "segments_updated_at"
  BEFORE UPDATE ON "segments"
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
