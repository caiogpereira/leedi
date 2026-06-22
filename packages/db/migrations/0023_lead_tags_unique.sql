-- PL-12 / Story 7.4: enforce lead-tag idempotency at the DB level.
--
-- The agent tool deduped tags with an in-app query-then-insert, leaving a
-- residual intra-turn race that could create duplicate (tenant_id, lead_id, tag)
-- rows, and the manual add path had no dedup at all. Add a UNIQUE constraint so
-- both insert paths can rely on ON CONFLICT DO NOTHING.
--
-- Adding the constraint fails if duplicates already exist, so collapse them
-- first (keeping the earliest row per group) in the same migration.

-- 1. Remove existing duplicates, keeping the earliest row per (tenant_id, lead_id, tag).
DELETE FROM lead_tags
WHERE id IN (
  SELECT id
  FROM (
    SELECT id,
           ROW_NUMBER() OVER (
             PARTITION BY tenant_id, lead_id, tag
             ORDER BY created_at, id
           ) AS rn
    FROM lead_tags
  ) ranked
  WHERE ranked.rn > 1
);

-- 2. Enforce uniqueness going forward.
ALTER TABLE lead_tags
  ADD CONSTRAINT lead_tags_tenant_lead_tag_unique UNIQUE (tenant_id, lead_id, tag);
