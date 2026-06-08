-- Story 18.1: notification infrastructure — push subscriptions, preferences, and notifications log.
-- RLS: push_subscriptions and notification_preferences scoped to owner user_id;
--      notifications scoped to owner user_id; service role INSERT/UPDATE all.

CREATE TYPE "notification_canal_enum" AS ENUM ('push', 'email', 'whatsapp');
--> statement-breakpoint
CREATE TYPE "notification_status_enum" AS ENUM ('pendente', 'enviado', 'lido', 'falhou');
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "push_subscriptions" (
  "id"         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id"    uuid        NOT NULL,
  "tenant_id"  uuid        NOT NULL REFERENCES "tenants"("id"),
  "endpoint"   text        NOT NULL,
  "p256dh"     text        NOT NULL,
  "auth"       text        NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  UNIQUE ("user_id", "endpoint")
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "notification_preferences" (
  "id"         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id"  uuid        NOT NULL REFERENCES "tenants"("id"),
  "user_id"    uuid        NOT NULL,
  "canais"     jsonb       NOT NULL DEFAULT '{"push": true, "email": true}',
  "eventos"    jsonb       NOT NULL DEFAULT '{}',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  UNIQUE ("tenant_id", "user_id")
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "notifications" (
  "id"         uuid                      PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id"  uuid                      NOT NULL REFERENCES "tenants"("id"),
  "user_id"    uuid                      NOT NULL,
  "tipo"       text                      NOT NULL,
  "titulo"     text,
  "corpo"      text,
  "canal"      notification_canal_enum   NOT NULL,
  "status"     notification_status_enum  NOT NULL DEFAULT 'pendente',
  "created_at" timestamptz               NOT NULL DEFAULT now()
);
--> statement-breakpoint

ALTER TABLE "push_subscriptions" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "push_subscriptions_owner"
  ON "push_subscriptions"
  USING ("user_id" = auth.uid());
--> statement-breakpoint

ALTER TABLE "notification_preferences" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "notification_preferences_owner"
  ON "notification_preferences"
  USING ("user_id" = auth.uid());
--> statement-breakpoint

ALTER TABLE "notifications" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "notifications_owner"
  ON "notifications"
  USING ("user_id" = auth.uid());
--> statement-breakpoint
