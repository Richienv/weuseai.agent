-- REVERT: revoke anon UPDATE on customers.
--
-- The previous migration (20260506140000_pairing_anon_update.sql) granted
-- anon a column-level UPDATE on customers.pairing_code +
-- customers.pairing_code_expires_at, paired with a permissive RLS policy
-- (USING true / WITH CHECK true).
--
-- 2026-05-06 SECURITY ISSUE FOUND VIA SMOKE TEST:
--   curl -X PATCH ... -d '{"display_name":"Hacked"}'   → HTTP 204
--   subsequent SELECT showed display_name actually changed.
--
-- Root cause: Supabase's default role grants on the public schema include
-- broader UPDATE on customers (inherited via the supabase_admin /
-- postgres role chain). Adding a column-level GRANT is ADDITIVE — it
-- does not REVOKE the broader privilege, so anon ended up able to
-- write any column under the permissive RLS policy.
--
-- Replacement architecture (Phase 1, post-incident):
--   - Anon stays SELECT-only on customers (RLS unchanged).
--   - Pairing-code rotation moves to a service-role Edge Function
--     `rotate-pairing-code` (added in the same commit as this migration).
--   - The page calls that function instead of PATCHing directly.
--
-- This migration explicitly drops the policy + revokes the column grant
-- to leave the table in a clean state and protect against any other
-- code paths that might have started relying on the loose anon UPDATE.

drop policy if exists "anon can rotate own pairing code" on customers;

revoke update (pairing_code, pairing_code_expires_at) on customers from anon;
