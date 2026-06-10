-- Fleet Sentinel (2026-06-07): fleet lifecycle + health + cost-guard.
--
-- Spec: docs/specs/2026-06-07-fable5-10x-build-spec.md
-- Audit: docs/audits/2026-06-07-fable5-systemwide-audit.md (P0 #1, #3, #6)
--
-- Background: nothing watches a customer's VPS after provision. The 30-day
-- auto-suspend the unit economics assume (Rp 145k → Rp 17k storage-only)
-- does not exist in code, so every idle VPS bills $5/mo forever; a dead
-- agent is found only by a customer complaint; a failed provision orphans a
-- billing VPS. This migration backs the `fleet-sentinel` Edge Function: it
-- adds activity/lifecycle tracking to vps_instances and an append-only
-- fleet_alerts table whose unique key gives the sentinel DB-level dedup so a
-- frequent cron never spams the founder.
--
-- Also folds in the three scale indexes the architecture audit flagged
-- (the sentinel's own queries lean on them).
--
-- Idempotent. Applied via Supabase Mgmt API.

-- ─── 1. vps_instances lifecycle columns ─────────────────────────

ALTER TABLE public.vps_instances
  ADD COLUMN IF NOT EXISTS last_activity_at timestamptz,
  ADD COLUMN IF NOT EXISTS lifecycle_state  text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS suspended_at     timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'vps_instances_lifecycle_state_chk'
  ) THEN
    ALTER TABLE public.vps_instances
      ADD CONSTRAINT vps_instances_lifecycle_state_chk
      CHECK (lifecycle_state IN ('active', 'idle_warned', 'suspended'));
  END IF;
END $$;

COMMENT ON COLUMN public.vps_instances.last_activity_at IS
  'Last customer activity (usage_log / onboarding / tier-bump). NULL = never active since provision. Drives idle-suspend + dead-agent detection.';
COMMENT ON COLUMN public.vps_instances.lifecycle_state IS
  'active | idle_warned | suspended. Set by the fleet-sentinel Edge Function.';

-- ─── 2. fleet_alerts (append-only, deduped) ─────────────────────

CREATE TABLE IF NOT EXISTS public.fleet_alerts (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id  uuid REFERENCES public.customers(id) ON DELETE CASCADE,
  kind         text NOT NULL,
  -- Stable key per (customer_id, kind) so the same situation alerts once per
  -- bucket: vps_id for one-shot conditions, a date bucket for recurring ones.
  dedup_bucket text NOT NULL,
  detail       jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at   timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT fleet_alerts_kind_chk CHECK (kind IN (
    'idle_suspend',
    'resume',
    'orphan_provision',
    'stale_bundle',
    'dead_agent',
    'runaway_spend'
  ))
);

-- DB-level dedup: the sentinel only inserts an alert it hasn't recorded for
-- this (customer, kind, bucket). The unique index makes the dedup race-proof
-- even if two cron ticks overlap.
CREATE UNIQUE INDEX IF NOT EXISTS fleet_alerts_dedup_idx
  ON public.fleet_alerts (customer_id, kind, dedup_bucket);

-- The sentinel reads "alerts already raised recently" to suppress repeats.
CREATE INDEX IF NOT EXISTS fleet_alerts_recent_idx
  ON public.fleet_alerts (created_at DESC);

ALTER TABLE public.fleet_alerts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.fleet_alerts FROM anon;
REVOKE ALL ON public.fleet_alerts FROM authenticated;
GRANT ALL ON public.fleet_alerts TO service_role;

COMMENT ON TABLE public.fleet_alerts IS
  'Append-only fleet-sentinel alert ledger. Unique (customer_id, kind, dedup_bucket) gives per-situation dedup. Service-role only.';

-- ─── 3. Scale indexes (architecture audit P1) ───────────────────

-- pending-provision sweep: subscriptions WHERE status='pending_provision'
-- AND started_at <= cutoff. Partial index keeps it tiny.
CREATE INDEX IF NOT EXISTS subscriptions_pending_provision_idx
  ON public.subscriptions (status, started_at)
  WHERE status = 'pending_provision';

-- multi-provider VPS lookup by (provider, vps_id).
CREATE INDEX IF NOT EXISTS vps_instances_provider_vps_id_idx
  ON public.vps_instances (provider, vps_id);

-- fleet-sentinel idle sweep: running VPSes ordered by activity.
CREATE INDEX IF NOT EXISTS vps_instances_lifecycle_activity_idx
  ON public.vps_instances (lifecycle_state, last_activity_at);

-- ─── 4. pg_cron schedule (every 15 min) ─────────────────────────
--
-- Founder sets the URL + service-role token via ALTER DATABASE SET after
-- this migration; until then the cron errors silently (pg_cron isolates job
-- failures). Recommended first run: FLEET_SENTINEL_DRY_RUN=true on the Edge
-- Function so it reports candidates without halting any VPS.

SELECT cron.unschedule(jobid)
FROM cron.job
WHERE jobname = 'fleet_sentinel_every_15min';

SELECT cron.schedule(
  'fleet_sentinel_every_15min',
  '*/15 * * * *',
  $cron$
    SELECT net.http_post(
      url := current_setting('app.fleet_sentinel_url', true),
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || current_setting('app.fleet_sentinel_token', true),
        'Content-Type', 'application/json'
      ),
      body := '{}'::jsonb
    );
  $cron$
);
