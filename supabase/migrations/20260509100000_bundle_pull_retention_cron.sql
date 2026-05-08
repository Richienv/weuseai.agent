-- Phase 2E-3 Day 4: bundle_pull_attempts retention via pg_cron.
--
-- Spec: docs/plans/2026-05-08-phase-2e-3-spec.md (retention scheduled function).
-- Builds on: 20260509000000_phase_2e3_tier_automation.sql (created the
-- bundle_pull_attempts_summary table).
--
-- What this does:
--   1. Creates `aggregate_bundle_pull_attempts()` — aggregates raw rows
--      older than 30 days into the weekly summary table, then deletes
--      the aggregated raw rows. Idempotent (UPSERT on summary primary
--      key; DELETE only the rows that were folded in).
--   2. Schedules the function via pg_cron at 03:00 UTC daily — same
--      cadence as the Vercel Cron orphan-resource cleanup so all
--      housekeeping happens together.
--
-- Why pg_cron and not a Supabase Scheduled Edge Function:
--   - The work is pure-SQL aggregate + delete. No HTTP, no external
--     API. pg_cron runs it in-DB, no round-trip to Edge runtime.
--   - pg_cron is enabled by default on Supabase Pro+ projects; we're
--     already on it for other workloads.
--
-- Apply path: paste into Dashboard → SQL Editor (GFW blocks direct pg
-- from China; see docs/risks-known.md). Idempotent — safe to re-run.

-- ─── 1. enable pg_cron extension (idempotent) ────────────────────────────

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA cron;

-- ─── 2. aggregate function ───────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.aggregate_bundle_pull_attempts()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cutoff_date timestamptz := now() - interval '30 days';
  inserted_rows int;
  pruned_rows int;
BEGIN
  -- 2a. Upsert weekly aggregates for any (customer_id, agent_slug,
  --     week_start) tuples that have raw rows older than the cutoff.
  --     ISO week-start = date_trunc('week', attempted_at).
  WITH raw AS (
    SELECT
      customer_id,
      agent_slug,
      date_trunc('week', attempted_at)::date AS week_start,
      count(*)                            AS attempt_count,
      count(*) FILTER (WHERE status = 'success')               AS success_count,
      count(*) FILTER (WHERE status <> 'success')              AS failure_count,
      avg(duration_ms) FILTER (WHERE status = 'success')::int  AS avg_duration_ms
    FROM public.bundle_pull_attempts
    WHERE attempted_at < cutoff_date
    GROUP BY customer_id, agent_slug, date_trunc('week', attempted_at)::date
  )
  INSERT INTO public.bundle_pull_attempts_summary (
    customer_id, agent_slug, week_start,
    attempt_count, success_count, failure_count, avg_duration_ms
  )
  SELECT
    customer_id, agent_slug, week_start,
    attempt_count, success_count, failure_count, avg_duration_ms
  FROM raw
  ON CONFLICT (customer_id, agent_slug, week_start) DO UPDATE
    SET
      attempt_count   = EXCLUDED.attempt_count,
      success_count   = EXCLUDED.success_count,
      failure_count   = EXCLUDED.failure_count,
      avg_duration_ms = EXCLUDED.avg_duration_ms;
  GET DIAGNOSTICS inserted_rows = ROW_COUNT;

  -- 2b. Prune raw rows older than the cutoff. ON CONFLICT in step 2a
  --     means re-running the same cutoff is safe — but the DELETE here
  --     means the next run will only see fresh-er rows.
  DELETE FROM public.bundle_pull_attempts
  WHERE attempted_at < cutoff_date;
  GET DIAGNOSTICS pruned_rows = ROW_COUNT;

  RETURN jsonb_build_object(
    'cutoff_date', cutoff_date,
    'aggregated_buckets', inserted_rows,
    'pruned_raw_rows', pruned_rows,
    'ran_at', now()
  );
END;
$$;

COMMENT ON FUNCTION public.aggregate_bundle_pull_attempts IS
  'Phase 2E-3 retention: aggregate bundle_pull_attempts >30d into the
   weekly summary table, prune the raw rows. Idempotent (UPSERT). Called
   by pg_cron at 03:00 UTC daily.';

-- ─── 3. schedule via pg_cron ─────────────────────────────────────────────
--
-- cron.schedule(name, schedule, sql_command). If a job with the same
-- name already exists, REPLACE behavior depends on pg_cron version —
-- safest pattern: unschedule + reschedule.

DO $$
BEGIN
  -- Drop any prior schedule with this name (idempotent re-apply path).
  PERFORM cron.unschedule('aggregate-bundle-pull-attempts')
  WHERE EXISTS (
    SELECT 1 FROM cron.job WHERE jobname = 'aggregate-bundle-pull-attempts'
  );
  PERFORM cron.schedule(
    'aggregate-bundle-pull-attempts',
    '0 3 * * *',
    $cron$SELECT public.aggregate_bundle_pull_attempts()$cron$
  );
END;
$$;

-- ─── 4. RLS / grants (defensive) ─────────────────────────────────────────
--
-- The aggregate function runs as SECURITY DEFINER (its owner = the
-- migration's service_role). pg_cron runs jobs as the postgres user,
-- which has full access. No additional grants needed for the function
-- to execute.
--
-- We DO NOT grant EXECUTE on the function to anon/authenticated — only
-- pg_cron should call it. Customers shouldn't be able to trigger
-- retention on demand.

REVOKE ALL ON FUNCTION public.aggregate_bundle_pull_attempts() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.aggregate_bundle_pull_attempts() FROM anon;
REVOKE ALL ON FUNCTION public.aggregate_bundle_pull_attempts() FROM authenticated;
