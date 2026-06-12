-- Story 17.2 (code-review fix): enforce idempotency of Asaas payment events at the
-- database level. The webhook → QStash → processBillingEvent path upserts invoices
-- keyed by the Asaas payment id; a UNIQUE index makes ON CONFLICT the real guard
-- (the Redis dedup key is only an optimization and can be lost on enqueue failure).
-- Partial index: asaas_payment_id is nullable (an invoice row may pre-exist a payment).

CREATE UNIQUE INDEX IF NOT EXISTS "invoices_asaas_payment_id_unique"
  ON "invoices" ("asaas_payment_id")
  WHERE "asaas_payment_id" IS NOT NULL;
