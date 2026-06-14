-- Fleet Sentinel — extend fleet_alerts.kind for the silent-failure monitors.
--
-- 2026-06-14. The fleet-sentinel cron now raises three fleet-wide alerts in
-- addition to the original six per-VPS kinds (see _shared/fleet-sentinel-handler.ts):
--   stuck_pending          — customer paid, no VPS after ~2h
--   bundle_pull_failures   — fleet-wide bundle-pull failures in the last hour
--   openrouter_credit_low  — parent provisioning key balance below threshold
--
-- The existing fleet_alerts_kind_chk CHECK constraint only allows the original
-- six kinds, so an INSERT of any new kind would fail and the founder DM would
-- silently never fire (recordAndAlert treats an insert error as "already
-- alerted"). Widening the constraint is the ONLY schema change these monitors
-- need — they reuse the existing fleet_alerts ledger, dedup index, and DM path.
--
-- Fleet-wide alerts use customer_id = NULL (the column is already nullable);
-- their per-day dedup is enforced in-handler via the existing-alerts read-back,
-- so no index change is required.
--
-- Idempotent. Applied via Supabase Mgmt API.

ALTER TABLE public.fleet_alerts
  DROP CONSTRAINT IF EXISTS fleet_alerts_kind_chk;

ALTER TABLE public.fleet_alerts
  ADD CONSTRAINT fleet_alerts_kind_chk CHECK (kind IN (
    'idle_suspend',
    'resume',
    'orphan_provision',
    'stale_bundle',
    'dead_agent',
    'runaway_spend',
    'stuck_pending',
    'bundle_pull_failures',
    'openrouter_credit_low'
  ));
