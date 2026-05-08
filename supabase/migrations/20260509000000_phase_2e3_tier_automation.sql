-- Phase 2E-3: tier automation, telemetry retention, cleanup audit (LOCKED 2026-05-08).
--
-- Spec: docs/plans/2026-05-08-phase-2e-3-spec.md
-- Builds on: 20260508140000_bundle_versioning_telemetry.sql (Phase 2E-2).
--
-- Three tables:
--   1. tier_change_events       — audit log of tier transitions (Xendit-paid
--                                  upgrades, manual admin changes, downgrades).
--                                  Powers customer-tier-bump Edge Function.
--   2. bundle_pull_attempts_summary — weekly aggregate of bundle_pull_attempts.
--                                  Filled by a nightly Supabase scheduled
--                                  function; raw rows >30d get pruned after
--                                  aggregation. Keeps the telemetry table
--                                  bounded as customer count grows.
--   3. cleanup_notifications    — audit of cleanup-orphan-vms.ts cron runs +
--                                  Telegram nudges. Lets us trace "when did
--                                  this leak start" historically.
--
-- All idempotent (IF NOT EXISTS guards) so a re-run on a partially-applied
-- DB doesn't fail.

-- ─── 1. tier_change_events ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.tier_change_events (
  id              uuid primary key default gen_random_uuid(),
  customer_id     uuid not null references public.customers(id) on delete cascade,
  from_tier       text not null check (from_tier in ('starter','pro','studio')),
  to_tier         text not null check (to_tier in ('starter','pro','studio')),
  reason          text not null check (reason in (
                    'xendit_invoice_paid',
                    'manual_admin',
                    'signup_default',
                    'downgrade_request'
                  )),
  -- Set when reason='xendit_invoice_paid'; null otherwise. Lets us trace
  -- a specific upgrade event back to its Xendit invoice.
  xendit_invoice_id text,
  triggered_at    timestamptz not null default now(),
  -- Set on success; null while in flight or after failure. error_detail
  -- gets populated on failure (provisioning service unreachable, SSH
  -- failed, etc.) so we don't lose context.
  completed_at    timestamptz,
  error_detail    text,
  -- Set when the customer Telegram nudge has been delivered. Lets us
  -- avoid re-notifying on retry without a separate idempotency key.
  notified_at     timestamptz
);

CREATE INDEX IF NOT EXISTS tier_change_events_customer_idx
  ON public.tier_change_events (customer_id, triggered_at DESC);

CREATE INDEX IF NOT EXISTS tier_change_events_xendit_invoice_idx
  ON public.tier_change_events (xendit_invoice_id)
  WHERE xendit_invoice_id IS NOT NULL;

COMMENT ON TABLE public.tier_change_events IS
  'Audit of tier transitions. customer-tier-bump Edge Function inserts on
   xendit-paid upgrades; manual admin changes also log here.';

-- ─── 2. bundle_pull_attempts_summary ──────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.bundle_pull_attempts_summary (
  customer_id      uuid not null references public.customers(id) on delete cascade,
  agent_slug       text not null,
  -- ISO week-start (Monday) in UTC. Granularity = 1 week trades resolution
  -- for table-size — at 100 customers × 50 weeks = 5000 rows, vs raw
  -- attempts at ~30 boots/customer/day = 90M rows/year.
  week_start       date not null,
  attempt_count    int not null default 0,
  success_count    int not null default 0,
  failure_count    int not null default 0,
  -- Average over successful attempts. NULL when success_count=0.
  avg_duration_ms  int,
  primary key (customer_id, agent_slug, week_start)
);

COMMENT ON TABLE public.bundle_pull_attempts_summary IS
  'Weekly aggregates of bundle_pull_attempts. Filled by a Supabase
   scheduled function nightly; raw rows >30d pruned after aggregation.';

-- ─── 3. cleanup_notifications ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.cleanup_notifications (
  id              uuid primary key default gen_random_uuid(),
  notification_at timestamptz not null default now(),
  resource_type   text not null check (resource_type in (
                    'orphan_vm',
                    'orphan_floating_ip'
                  )),
  count_flagged   int not null check (count_flagged >= 0),
  -- Per-orphan detail: array of { uuid, address, age_hours, ... }. JSON
  -- not relational because (a) volume is low, (b) schema may evolve as
  -- we discover new failure modes, (c) we mostly care about it as a
  -- forensic blob, not as a queryable graph.
  details         jsonb not null default '[]'::jsonb,
  notified_via    text not null check (notified_via in ('telegram','log_only'))
);

CREATE INDEX IF NOT EXISTS cleanup_notifications_at_idx
  ON public.cleanup_notifications (notification_at DESC);

COMMENT ON TABLE public.cleanup_notifications IS
  'Audit of cleanup-orphan-vms.ts cron runs. notified_via=log_only when
   Telegram is unconfigured or no orphans were found. Useful for tracing
   "when did this leak start" months later.';
