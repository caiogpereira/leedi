-- PL-17 / Story 13.2: add an `enviando` (claiming) state to dispatch_target_status.
--
-- The batch worker selects `pendente` targets, sends each WhatsApp template, then
-- marks `enviado` in a SEPARATE transaction. If the process dies after a
-- successful send but before the row flips to `enviado`, a QStash redelivery
-- re-selects the still-`pendente` row and re-sends — a real message cost +
-- quality-rating risk. The fix is an atomic claim `pendente -> enviando` BEFORE
-- the send (compare-and-set), so a redelivered/concurrent worker that finds the
-- row no longer `pendente` skips it.
--
-- IMPORTANT: this migration only ADDS the enum value (it is not used in this
-- file). ALTER TYPE ... ADD VALUE cannot be used in the same transaction that
-- adds it; the worker code that uses `enviando` deploys separately. Keep this as
-- the sole statement in the migration.

ALTER TYPE dispatch_target_status ADD VALUE IF NOT EXISTS 'enviando' BEFORE 'enviado';
