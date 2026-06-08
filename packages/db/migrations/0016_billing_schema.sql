-- Story 17.1: billing schema — subscriptions and invoices tables for Asaas integration.
-- RLS: tenant members can SELECT; only service role can INSERT/UPDATE (enforced by app layer).

CREATE TYPE "billing_plan_enum" AS ENUM ('starter', 'pro', 'enterprise');
--> statement-breakpoint
CREATE TYPE "billing_status_enum" AS ENUM ('ativa', 'atrasada', 'cancelada', 'trial');
--> statement-breakpoint
CREATE TYPE "invoice_status_enum" AS ENUM ('pendente', 'pago', 'atrasado', 'cancelado');
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "subscriptions" (
  "id"                    uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id"             uuid          NOT NULL REFERENCES "tenants"("id"),
  "asaas_customer_id"     text,
  "asaas_subscription_id" text,
  "plano"                 billing_plan_enum NOT NULL,
  "valor"                 numeric       NOT NULL,
  "ciclo"                 text          NOT NULL DEFAULT 'mensal',
  "status"                billing_status_enum NOT NULL DEFAULT 'ativa',
  "proximo_vencimento"    date,
  "created_at"            timestamptz   NOT NULL DEFAULT now(),
  "updated_at"            timestamptz   NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "invoices" (
  "id"               uuid             PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id"        uuid             NOT NULL REFERENCES "tenants"("id"),
  "subscription_id"  uuid             REFERENCES "subscriptions"("id"),
  "asaas_payment_id" text,
  "valor"            numeric,
  "vencimento"       date,
  "pago_em"          timestamptz,
  "status"           invoice_status_enum NOT NULL DEFAULT 'pendente',
  "inclui_overage"   boolean          NOT NULL DEFAULT false,
  "valor_overage"    numeric          NOT NULL DEFAULT 0,
  "receipt_url"      text,
  "created_at"       timestamptz      NOT NULL DEFAULT now()
);
--> statement-breakpoint

ALTER TABLE "subscriptions" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "subscriptions_tenant_isolation"
  ON "subscriptions"
  USING (
    "tenant_id" = current_setting('app.tenant_id', true)::uuid
  );
--> statement-breakpoint

ALTER TABLE "invoices" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "invoices_tenant_isolation"
  ON "invoices"
  USING (
    "tenant_id" = current_setting('app.tenant_id', true)::uuid
  );
