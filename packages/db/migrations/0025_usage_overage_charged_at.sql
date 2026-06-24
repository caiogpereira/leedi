-- Story: automatic overage billing. Tracks when a period's accumulated overage
-- was charged (one-off Asaas cobrança), so the monthly job never double-charges.
-- Additive + nullable: safe to apply before the code deploy (old code ignores it).
ALTER TABLE "usage_counters" ADD COLUMN IF NOT EXISTS "overage_cobrado_em" timestamptz;
