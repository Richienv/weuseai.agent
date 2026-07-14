-- Sesi A D1 (2026-05-13): provision_retry_attempts table + pg_cron schedule.
--
-- Audit doc: docs/audit/2026-05-13-customer-flow-hardening.md §P1-CF-6 Phase 2.
--
-- Background: A3 (PR #101) shipped customer-facing copy that promises
--   "Agent kamu dijadwalkan ulang otomatis — kami coba lagi setiap 3
--    menit. Kalau dalam 30 menit belum berhasil, tim kami hubungi
--    kamu via email."
-- This migration + companion Edge Function (`retry-pending-provisions`)
-- make good on that promise.
--
-- Design:
--   - One row per retry attempt per subscription. Append-only.
--   - pg_cron fires every 3 minutes via net.http_post → the
--     retry-pending-provisions Edge Function (using service-role).
--   - The Edge Function reads stale pending_provision rows + their
--     attempt history, runs at most 1 spinUp retry per row per cron
--     tick, caps at 6 attempts (after which it flags for founder
--     manual reconcile).
--
-- Idempotent. Applied via Supabase Mgmt API.

-- ─── 1. Table ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.provision_retry_attempts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id uuid NOT NULL REFERENCES public.subscriptions(id) ON DELETE CASCADE,
  customer_id     uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  attempt_number  integer NOT NULL,
  attempted_at    timestamptz NOT NULL DEFAULT now(),
  outcome         text NOT NULL,
  detail          text,
  -- For audit / dashboard:
  created_at      timestamptz NOT NULL DEFAULT now(),

  -- Outcome whitelist. Add via future migration when product needs.
  CONSTRAINT provision_retry_attempts_outcome_chk
    CHECK (outcome IN (
      'in_flight',          -- spin-up call started, not yet returned
      'spin_up_ok',         -- spin-up returned 200, VPS provisioned
      'capacity_exhausted', -- 503 vps_capacity_exhausted (Vultr + DO both full)
      'other_error',        -- network / 5xx / unknown
      'exhausted'           -- max retries reached, founder manual reconcile needed
    )),
  CONSTRAINT provision_retry_attempts_attempt_number_chk
    CHECK (attempt_number >= 1 AND attempt_number <= 10)
);

-- Index for the worker's lookup pattern: "what's the latest attempt
-- for this subscription?"
CREATE INDEX IF NOT EXISTS provision_retry_attempts_subscription_idx
  ON public.provision_retry_attempts (subscription_id, attempted_at DESC);

-- Index for the daily-digest cron (Phase 4) — "list all exhausted
-- attempts from the last 24h."
CREATE INDEX IF NOT EXISTS provision_retry_attempts_exhausted_idx
  ON public.provision_retry_attempts (outcome, attempted_at DESC)
  WHERE outcome = 'exhausted';

-- ─── 2. RLS ──────────────────────────────────────────────────────
--
-- Service-role only. Customers don't read their own retry log
-- (founder reconciles manually via Telegram alert / daily digest).

ALTER TABLE public.provision_retry_attempts ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.provision_retry_attempts FROM anon;
REVOKE ALL ON public.provision_retry_attempts FROM authenticated;
GRANT ALL ON public.provision_retry_attempts TO service_role;

COMMENT ON TABLE public.provision_retry_attempts IS
  'Append-only audit log of pg_cron-driven retry-pending-provisions invocations. Service-role only.';
COMMENT ON COLUMN public.provision_retry_attempts.outcome IS
  'in_flight | spin_up_ok | capacity_exhausted | other_error | exhausted';

-- ─── 3. pg_cron schedule ────────────────────────────────────────
--
-- Every 3 minutes, invoke the retry-pending-provisions Edge Function
-- via net.http_post (pg_net). The Edge Function reads stale rows,
-- runs at most 1 spinUp retry per row per tick, and writes an
-- attempt row.
--
-- The schedule references env-vars resolved at insert time:
--   - retry_pending_provisions.url   — full Edge Function URL
--   - retry_pending_provisions.token — service-role JWT for auth
--
-- Both are set via ALTER DATABASE SET (resolved during cron exec).
-- Founder applies these settings via Mgmt API immediately after this
-- migration; until then the cron simply errors silently (pg_cron's
-- error doesn't block other jobs).

-- Drop any previous schedule under this name first (idempotent).
SELECT cron.unschedule(jobid)
FROM cron.job
WHERE jobname = 'retry_pending_provisions_every_3min';

SELECT cron.schedule(
  'retry_pending_provisions_every_3min',
  '*/3 * * * *',
  $cron$
    SELECT net.http_post(
      url := current_setting('app.retry_pending_provisions_url', true),
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || current_setting('app.retry_pending_provisions_token', true),
        'Content-Type', 'application/json'
      ),
      body := '{}'::jsonb
    );
  $cron$
);
