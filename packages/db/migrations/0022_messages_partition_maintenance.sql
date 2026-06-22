-- 0022: messages partition maintenance (PL-15)
--
-- The `messages` table is RANGE-partitioned by `created_at` (migration 0006), but
-- 0006 only created the 2026_06 / 2026_07 / 2026_08 partitions. Postgres does NOT
-- auto-create the next month's partition, so an inbound message with
-- created_at >= 2026-09-01 would hit no partition → the INSERT throws → and
-- processMessage(...).catch(captureException) swallows it = SILENT message loss
-- after 2026-08-31.
--
-- Fix: a plpgsql maintenance function + a pg_cron schedule that creates future
-- monthly partitions ahead of time. Chosen over a scheduled Edge Function because
-- it runs entirely inside Postgres (atomic, no HTTP hop that can fail silently).
-- New partitions inherit the parent's RLS policy and updated_at trigger
-- automatically (declarative partitioning, PG11+), so no extra DDL per partition.

create extension if not exists pg_cron;

-- Creates the next `months_ahead` monthly partitions of `messages` if missing.
-- Idempotent: CREATE TABLE IF NOT EXISTS makes re-runs and overlap with existing
-- partitions a no-op.
create or replace function public.create_future_message_partitions(months_ahead integer default 2)
returns void
language plpgsql
as $$
declare
  i integer;
  start_date date;
  end_date date;
  partition_name text;
begin
  for i in 1..months_ahead loop
    start_date := (date_trunc('month', now()) + make_interval(months => i))::date;
    end_date := (start_date + interval '1 month')::date;
    partition_name := 'messages_' || to_char(start_date, 'YYYY_MM');
    execute format(
      'create table if not exists public.%I partition of public.messages for values from (%L) to (%L)',
      partition_name, start_date, end_date
    );
  end loop;
end;
$$;

-- Schedule at 03:00 UTC on day 20 of every month, creating the next 2 months.
-- Unschedule first so re-applying this migration never duplicates the job.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'create-message-partitions') then
    perform cron.unschedule('create-message-partitions');
  end if;
end $$;

select cron.schedule(
  'create-message-partitions',
  '0 3 20 * *',
  $$select public.create_future_message_partitions(2)$$
);

-- Seed immediately so the gap is closed now (covers the next few months beyond
-- the existing 2026_08, removing the 2026-08-31 deadline pressure).
select public.create_future_message_partitions(4);
