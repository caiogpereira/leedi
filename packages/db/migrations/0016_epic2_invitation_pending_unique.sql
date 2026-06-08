-- Story 2.6 (Task 1 + pitfall): enforce "at most one PENDING invite per
-- (tenant, email)" at the DATABASE layer, not only in app code (select-then-insert
-- races could otherwise create duplicate pending invites).
--
-- Pending == not yet accepted (`accepted_at IS NULL`). Expiry is NOT part of the
-- predicate because index predicates must be immutable (`now()` is not), so the
-- "not expired" portion stays in application logic; an expired-but-unaccepted row
-- still blocks a duplicate, which is the safe direction.
CREATE UNIQUE INDEX IF NOT EXISTS "invitations_pending_email_idx"
  ON "invitations" ("tenant_id", "email")
  WHERE "accepted_at" IS NULL;
