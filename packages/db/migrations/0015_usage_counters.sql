-- Story 16.1: usage_counters — tracks monthly conversation and AI cost usage per tenant.
-- Increment strategy: atomic ON CONFLICT DO UPDATE (see packages/usage) — never a SELECT+UPDATE.
-- RLS: tenant policy scopes rows to the tenant; super-admin reads custo_ia_usd via service role.

CREATE TABLE IF NOT EXISTS "usage_counters" (
  "id"                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id"          uuid        NOT NULL REFERENCES "tenants"("id"),
  "periodo"            text        NOT NULL,
  "conversas_usadas"   integer     NOT NULL DEFAULT 0,
  "conversas_limite"   integer     NOT NULL,
  "overage_conversas"  integer     NOT NULL DEFAULT 0,
  "overage_valor"      numeric(10,2) NOT NULL DEFAULT 0,
  "custo_ia_usd"       numeric(10,4) NOT NULL DEFAULT 0,
  "alertas_enviados"   jsonb       NOT NULL DEFAULT '[]',
  "updated_at"         timestamptz DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "usage_counters_tenant_periodo_uniq"
  ON "usage_counters" ("tenant_id", "periodo");
--> statement-breakpoint
ALTER TABLE "usage_counters" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
-- Tenant-scoped policy: members see only their tenant's counters.
-- custo_ia_usd is hidden by the application layer (never returned in tenant-facing APIs).
CREATE POLICY "usage_counters_tenant_isolation"
  ON "usage_counters"
  USING (
    "tenant_id" = current_setting('app.tenant_id', true)::uuid
  );
