-- Story 6.4: sales_methods table + tenants.config column
-- tenants.config is a generic jsonb preference bag added here so Story 6.4 can
-- temporarily store tenant_sales_method_preference until Story 7.1 wires it
-- into agent_configs.sales_method_id (FK).
-- Global seed records have tenant_id = NULL.
-- No RLS: global rows have no tenant_id; per-tenant custom methods are a future feature.
-- No updated_at / trigger: sales_methods are immutable once seeded (Architecture §6.7).

-- ─── tenants.config ─────────────────────────────────────────────────────────────
ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "config" jsonb DEFAULT '{}'::jsonb NOT NULL;

-- ─── Enum ───────────────────────────────────────────────────────────────────────
CREATE TYPE "public"."sales_method_nome" AS ENUM('spin', 'aida', 'storytelling', 'livre');

-- ─── sales_methods ──────────────────────────────────────────────────────────────
CREATE TABLE "sales_methods" (
  "id"                     uuid                     DEFAULT gen_random_uuid() NOT NULL,
  "nome"                   "sales_method_nome"      NOT NULL,
  "titulo"                 text                     NOT NULL,
  "descricao"              text                     NOT NULL,
  "system_prompt_template" text                     NOT NULL,
  "phases"                 jsonb                    NOT NULL,
  "is_global"              boolean                  DEFAULT false NOT NULL,
  "tenant_id"              uuid,
  "created_at"             timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "sales_methods_pkey" PRIMARY KEY ("id")
);
