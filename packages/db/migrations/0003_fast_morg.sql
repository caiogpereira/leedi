CREATE TYPE "public"."whatsapp_connection_status" AS ENUM('conectado', 'erro', 'desconectado');--> statement-breakpoint
CREATE TYPE "public"."whatsapp_messaging_tier" AS ENUM('1k', '10k', '100k', 'unlimited');--> statement-breakpoint
CREATE TYPE "public"."whatsapp_quality_rating" AS ENUM('verde', 'amarelo', 'vermelho');--> statement-breakpoint
CREATE TABLE "whatsapp_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"phone_number_id" text NOT NULL,
	"waba_id" text NOT NULL,
	"access_token_encrypted" text NOT NULL,
	"access_token_iv" text NOT NULL,
	"status" "whatsapp_connection_status" DEFAULT 'desconectado' NOT NULL,
	"quality_rating" "whatsapp_quality_rating",
	"messaging_tier" "whatsapp_messaging_tier",
	"display_name" text,
	"last_health_check_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "whatsapp_connections_tenant_id_unique" UNIQUE("tenant_id")
);
--> statement-breakpoint
ALTER TABLE "whatsapp_connections" ADD CONSTRAINT "whatsapp_connections_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- Enable RLS on the tenant-scoped whatsapp_connections table (Story 4.1)
ALTER TABLE "whatsapp_connections" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "whatsapp_connections" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
-- Tenant isolation: connection visible only when app.tenant_id matches.
CREATE POLICY "tenant_isolation" ON "whatsapp_connections"
  USING ("tenant_id" = current_setting('app.tenant_id', true)::uuid);--> statement-breakpoint
-- updated_at trigger: bump updated_at on every row update
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER whatsapp_connections_set_updated_at
  BEFORE UPDATE ON "whatsapp_connections"
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();