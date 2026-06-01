CREATE TYPE "public"."lead_status" AS ENUM('ativo', 'optout', 'bloqueado');--> statement-breakpoint
CREATE TYPE "public"."lead_tag_origem" AS ENUM('manual', 'agente');--> statement-breakpoint
CREATE TYPE "public"."lead_temperatura" AS ENUM('frio', 'morno', 'quente');--> statement-breakpoint
CREATE TABLE "lead_journey_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lead_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"tipo" text NOT NULL,
	"detalhes" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lead_tags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lead_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"tag" text NOT NULL,
	"origem_tag" "lead_tag_origem" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "leads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"telefone" text NOT NULL,
	"nome" text,
	"email" text,
	"origem" text,
	"temperatura" "lead_temperatura" DEFAULT 'frio' NOT NULL,
	"status" "lead_status" DEFAULT 'ativo' NOT NULL,
	"comprou" boolean DEFAULT false NOT NULL,
	"produto_comprado_id" uuid,
	"data_compra" timestamp with time zone,
	"primeira_interacao" timestamp with time zone,
	"ultima_interacao" timestamp with time zone,
	"qualificacao" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"lead_recorrente" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "leads_tenant_id_telefone_unique" UNIQUE("tenant_id","telefone")
);
--> statement-breakpoint
ALTER TABLE "lead_journey_events" ADD CONSTRAINT "lead_journey_events_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_tags" ADD CONSTRAINT "lead_tags_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- Enable RLS on tenant-scoped lead tables (Story 5.1)
ALTER TABLE "leads" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "leads" FORCE ROW LEVEL SECURITY;
CREATE POLICY "leads_tenant_isolation" ON "leads"
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
--> statement-breakpoint
ALTER TABLE "lead_tags" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "lead_tags" FORCE ROW LEVEL SECURITY;
CREATE POLICY "lead_tags_tenant_isolation" ON "lead_tags"
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
--> statement-breakpoint
ALTER TABLE "lead_journey_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "lead_journey_events" FORCE ROW LEVEL SECURITY;
CREATE POLICY "lead_journey_events_tenant_isolation" ON "lead_journey_events"
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
--> statement-breakpoint
-- updated_at trigger for leads (reuses set_updated_at() from migration 0003)
CREATE TRIGGER leads_set_updated_at
  BEFORE UPDATE ON "leads"
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();