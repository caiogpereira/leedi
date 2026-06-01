-- Story 6.1: products + knowledge_base tables
-- Both tables ship in ONE migration to avoid schema drift (story dev notes).
-- set_updated_at() function was created in migration 0004 — do NOT redefine it.
-- pgvector / embedding column deferred to V2 — not enabled here.

-- ─── Enums ──────────────────────────────────────────────────────────────────────
CREATE TYPE "public"."product_tipo" AS ENUM('principal', 'downsell', 'upsell', 'orderbump');
CREATE TYPE "public"."knowledge_base_tipo" AS ENUM('faq', 'objecao');

-- ─── products ───────────────────────────────────────────────────────────────────
CREATE TABLE "products" (
  "id"                  uuid                     DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id"           uuid                     NOT NULL,
  "nome"                text                     NOT NULL,
  "descricao"           text,
  "preco"               numeric                  NOT NULL,
  "parcelas"            integer,
  "preco_parcelado"     numeric,
  "link_checkout"       text                     NOT NULL,
  "tipo"                "product_tipo"           DEFAULT 'principal' NOT NULL,
  "argumentos"          jsonb                    DEFAULT '[]'::jsonb NOT NULL,
  "diferenciais"        jsonb                    DEFAULT '[]'::jsonb NOT NULL,
  "provas_sociais"      jsonb                    DEFAULT '[]'::jsonb NOT NULL,
  "garantia"            text,
  "bonus"               jsonb                    DEFAULT '[]'::jsonb NOT NULL,
  "gateway_product_id"  text,
  "ativo"               boolean                  DEFAULT true NOT NULL,
  "created_at"          timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at"          timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "products"
  ADD CONSTRAINT "products_tenant_id_fk"
  FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;

ALTER TABLE "products" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "products" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "products"
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

CREATE TRIGGER set_products_updated_at
  BEFORE UPDATE ON "products"
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─── knowledge_base ─────────────────────────────────────────────────────────────
CREATE TABLE "knowledge_base" (
  "id"                    uuid                     DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id"             uuid                     NOT NULL,
  "tipo"                  "knowledge_base_tipo"    NOT NULL,
  "pergunta_ou_objecao"   text                     NOT NULL,
  "resposta_ou_contorno"  text                     NOT NULL,
  "categoria"             text,
  -- embedding column deferred to V2 (pgvector not enabled)
  "ativo"                 boolean                  DEFAULT true NOT NULL,
  "created_at"            timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at"            timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "knowledge_base_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "knowledge_base"
  ADD CONSTRAINT "knowledge_base_tenant_id_fk"
  FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;

ALTER TABLE "knowledge_base" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "knowledge_base" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "knowledge_base"
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

CREATE TRIGGER set_knowledge_base_updated_at
  BEFORE UPDATE ON "knowledge_base"
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
