-- Story 13.3 fix: recovery targets are tied to a dispatch_rule, not a dispatch_job.
-- dispatch_targets.dispatch_job_id must therefore be nullable.
ALTER TABLE "dispatch_targets" ALTER COLUMN "dispatch_job_id" DROP NOT NULL;
