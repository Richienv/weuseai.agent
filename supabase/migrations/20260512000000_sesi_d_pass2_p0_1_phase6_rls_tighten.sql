-- Sesi D pass-2 security audit — P0-1 fix.
--
-- Source: docs/audits/2026-05-10-security-audit-sesi-d-pass-2.md
--   "Phase 6-1.a migration introduces 3 new tables with USING (true) —
--    recurrence of pass-1 P0-1 anti-pattern"
--
-- Affected tables (3, all from Phase 6-1.a foundation):
--   - department_workspaces  (leaks simulated_team, charter_md, telegram_thread_id)
--   - approval_patterns      (leaks auto-approval rules, strategic reasoning)
--   - daily_digests          (leaks per-customer M/W/F strategic state)
--
-- Same root cause + same fix shape as pass-1 P0-1 (Phase 5 tables).
--
-- The Phase 6-1.a migration (20260510150000) ships these 3 tables with
-- `anon SELECT ... USING (true)` policies. Migration comments dismissed
-- the concern with "per-customer scoping enforced by JWT-issuing handler"
-- — the same dismissed reasoning pass-1 P0-1 already invalidated. The
-- supabase anon JWT is publicly hardcoded in onboarding.html /
-- checkout.html / welcome.html, so the RLS is the actual gate.
--
-- Fix (per audit recommendation, mirrors pass-1 P0-1 fix shape):
--   default-deny via `USING (false)`. These tables are NOT yet consumed
--   by landing pages (Phase 6 features unshipped to customers). Future
--   customer reads route through service-role Edge Functions; pattern
--   to be designed alongside the new `HERMES_INSTANCE_HMAC_KEY`-gated
--   verifier that already exists for Phase 5 (approval-queue,
--   roadmap-state).
--
-- Note: codebase_integrations and persona_memories (also from Phase
-- 6-1.a) correctly omit anon SELECT policies — service-role only. They
-- need no changes here.
--
-- Idempotent. Applied via Supabase Management API.

-- ─── 1. Drop existing permissive Phase 6-1.a policies ────────────────

DROP POLICY IF EXISTS "anon read own workspaces" ON public.department_workspaces;
DROP POLICY IF EXISTS "anon read own approval patterns" ON public.approval_patterns;
DROP POLICY IF EXISTS "anon read own digests" ON public.daily_digests;

-- ─── 2. Replace with default-deny policies ──────────────────────────
--
-- USING (false) means anon/authenticated cannot SELECT any row.
-- Service-role bypasses RLS automatically (not affected).
--
-- Explicit policy (rather than just dropping all policies) so the
-- intent is greppable + drift-test friendly. A future audit catches
-- "no policy" as a different signal than "explicit deny."

CREATE POLICY "deny anon select on department_workspaces"
  ON public.department_workspaces FOR SELECT
  TO anon
  USING (false);

CREATE POLICY "deny anon select on approval_patterns"
  ON public.approval_patterns FOR SELECT
  TO anon
  USING (false);

CREATE POLICY "deny anon select on daily_digests"
  ON public.daily_digests FOR SELECT
  TO anon
  USING (false);

-- ─── 3. Drift-defense comments ──────────────────────────────────────

COMMENT ON POLICY "deny anon select on department_workspaces"
  ON public.department_workspaces IS
  'Sesi D pass-2 P0-1 lock 2026-05-12: default-deny. Customer reads must route through service-role Edge Function (when Phase 6 customer surfaces ship). DO NOT replace with USING (true) without re-audit + new threat model — recurrence already happened once (Phase 6-1.a) after pass-1 P0-1 fixed the same anti-pattern on Phase 5.';

COMMENT ON POLICY "deny anon select on approval_patterns"
  ON public.approval_patterns IS
  'Sesi D pass-2 P0-1 lock 2026-05-12: default-deny. approval_patterns store strategic auto-approval rules (match_conditions jsonb) — cross-customer leak is competitive intelligence on every customer. Reads via service-role only.';

COMMENT ON POLICY "deny anon select on daily_digests"
  ON public.daily_digests IS
  'Sesi D pass-2 P0-1 lock 2026-05-12: default-deny. daily_digests body_md is per-customer M/W/F strategic state; DO NOT replace with USING (true). Reads via service-role only.';
