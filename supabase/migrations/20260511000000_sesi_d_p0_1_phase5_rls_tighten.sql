-- Sesi D security audit — P0-1 fix.
--
-- Source: docs/audits/2026-05-10-security-audit-sesi-d.md
--   "Phase 5 strategic-data tables expose ALL customers' data to any
--    anon-key holder"
--
-- Affected tables (4):
--   - business_roadmap_state  (Phase 5-1.a)
--   - approval_requests       (Phase 5-1.a)
--   - department_threads      (Phase 5-1.a)
--   - bd_decisions_log        (Phase 5-3.a)
--
-- Root cause: each ships an `anon SELECT ... USING (true)` policy. The
-- supabase anon JWT is publicly hardcoded in onboarding.html /
-- checkout.html / welcome.html, so the RLS is the actual gate, and it's
-- wide open. Per audit P0-1: leak surface includes incorporation
-- paperwork, contract terms, regulatory filings, strategic decision
-- history, and free-form founder notes.
--
-- Fix (per audit recommendation): default-deny via `USING (false)`.
-- These tables are NOT consumed by landing pages today (Phase 5 has zero
-- live customers); future customer reads route through service-role
-- Edge Functions (`roadmap-state`, `approval-queue` already exist;
-- their HMAC verifier landed in PR #32 and must be enabled in prod —
-- separate Sesi D P1-3 finding).
--
-- Idempotent. Applied via Supabase Management API.

-- ─── 1. Drop existing permissive policies ────────────────────────────

DROP POLICY IF EXISTS "anon read own roadmap state" ON public.business_roadmap_state;
DROP POLICY IF EXISTS "anon read own approvals" ON public.approval_requests;
DROP POLICY IF EXISTS "anon read own dept threads" ON public.department_threads;
DROP POLICY IF EXISTS "anon read own bd decisions" ON public.bd_decisions_log;

-- ─── 2. Replace with default-deny policies ──────────────────────────
--
-- USING (false) means anon/authenticated cannot SELECT any row.
-- Service-role bypasses RLS automatically (not affected).
--
-- We keep an explicit policy (rather than just dropping all policies)
-- so the intent is greppable + drift-test friendly. A future audit
-- catches "no policy" as a different signal than "explicit deny."

CREATE POLICY "deny anon select on business_roadmap_state"
  ON public.business_roadmap_state FOR SELECT
  TO anon
  USING (false);

CREATE POLICY "deny anon select on approval_requests"
  ON public.approval_requests FOR SELECT
  TO anon
  USING (false);

CREATE POLICY "deny anon select on department_threads"
  ON public.department_threads FOR SELECT
  TO anon
  USING (false);

CREATE POLICY "deny anon select on bd_decisions_log"
  ON public.bd_decisions_log FOR SELECT
  TO anon
  USING (false);

-- ─── 3. Drift-defense comments ──────────────────────────────────────

COMMENT ON POLICY "deny anon select on business_roadmap_state"
  ON public.business_roadmap_state IS
  'Sesi D P0-1 lock 2026-05-11: default-deny. Customer reads must route through roadmap-state Edge Function (service-role). DO NOT replace with USING (true) without re-audit + new threat model.';
COMMENT ON POLICY "deny anon select on approval_requests"
  ON public.approval_requests IS
  'Sesi D P0-1 lock 2026-05-11: default-deny. Customer reads must route through approval-queue Edge Function (service-role + HMAC verifier). DO NOT replace with USING (true).';
COMMENT ON POLICY "deny anon select on department_threads"
  ON public.department_threads IS
  'Sesi D P0-1 lock 2026-05-11: default-deny. No customer-facing reader yet; future reads go through service-role Edge Function.';
COMMENT ON POLICY "deny anon select on bd_decisions_log"
  ON public.bd_decisions_log IS
  'Sesi D P0-1 lock 2026-05-11: default-deny. Read by BD v3 prompt template via service-role at session start; never customer-readable.';
