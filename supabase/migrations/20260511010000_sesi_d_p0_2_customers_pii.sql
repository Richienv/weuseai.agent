-- Sesi D security audit — P0-2 fix.
--
-- Source: docs/audits/2026-05-10-security-audit-sesi-d.md
--   "customers table SELECT-all leaks PII + soul_md_text + pairing_code
--    to any anon"
--
-- Root cause: customers table ships `anon SELECT ... USING (true)`
-- policy. Public anon JWT is hardcoded in landing pages. Audit demo:
--   anon-key holder enumerates rows → leaks email + whatsapp_number +
--   soul_md_text (full persona contract, up to ~10kB strategic
--   narrative per customer) across all customers.
--
-- Two-layer fix per audit recommendation:
--   1. Tighten SELECT policy to require X-CID request header matching
--      the row id. Stops cross-customer enumeration; attacker now needs
--      to know each cid in advance (UUIDs are 128-bit, unguessable).
--   2. Column-level REVOKE on the 3 PII columns (soul_md_text, email,
--      whatsapp_number) so even with X-CID header those fields stay
--      service-role-only.
--
-- Onboarding.html update (separate file in this PR):
--   - Sends X-CID header on every customer fetch
--   - Drops soul_md_text from SELECT (was unused anyway)
--   - Drops email + whatsapp_number from SELECT (would 403 post-REVOKE)
--   - Customer re-enters email/whatsapp from checkout flow inputs
--
-- Idempotent. Applied via Supabase Management API.

-- ─── 1. Replace permissive policy with cid-header-scoped policy ────

DROP POLICY IF EXISTS "anon can read own customer onboarding state" ON public.customers;
DROP POLICY IF EXISTS "anon read own customer scoped by x-cid" ON public.customers;

CREATE POLICY "anon read own customer scoped by x-cid"
  ON public.customers FOR SELECT
  TO anon
  USING (
    -- Match row only when the X-CID request header equals row.id.
    -- PostgREST exposes request headers as a json GUC (lowercase keys).
    -- Throws on null current_setting → coalesce to empty json prevents
    -- 500-on-missing-header; instead the comparison just fails and
    -- returns 0 rows.
    id = (
      coalesce(
        current_setting('request.headers', true),
        '{}'
      )::json->>'x-cid'
    )::uuid
  );

COMMENT ON POLICY "anon read own customer scoped by x-cid"
  ON public.customers IS
  'Sesi D P0-2 lock 2026-05-11: cross-customer enumeration via PostgREST anon key blocked. Anon must include X-CID header matching row.id; without header, 0 rows returned. Phase 2B signed-JWT will replace this with auth.uid()=id pattern. DO NOT replace with USING (true) without re-audit.';

-- ─── 2. Column-level GRANT allowlist (REVOKE table → GRANT cols) ────
--
-- IMPORTANT: column-level REVOKE only takes effect after table-level
-- SELECT is revoked. The previous Phase 2.5 #11 attempt at REVOKE
-- (column-only on telegram_bot_token) was a NO-OP — table-level GRANT
-- silently overrode it. This migration fixes both Sesi D P0-2 PII +
-- the historical telegram_bot_token leak.
--
-- Pattern: REVOKE SELECT ON customers (table) → GRANT SELECT (allowed
-- columns) ON customers (column-allowlist).

-- Step 2a: revoke table-level SELECT on customers from anon + authenticated.
-- This wipes the implicit "all columns" grant.
REVOKE SELECT ON public.customers FROM anon, authenticated;

-- Step 2b: grant SELECT only on non-PII columns. Allowlist is what
-- landing pages legitimately need:
--   - id: cid lookup (required)
--   - display_name: form pre-fill (low-sensitivity name)
--   - telegram_chat_id, telegram_bot_username: pairing flow display
--   - pairing_code, pairing_code_expires_at: pairing flow display + timer
--   - telegram_allowed_user_ids: pairing flow allow-list display
--   - created_at: pairing flow age check
-- Excluded (now service-role only):
--   - soul_md_text (PII — per Sesi D P0-2; was unused by pages anyway)
--   - email (PII per UU PDP — Sesi D P0-2)
--   - whatsapp_number (PII per UU PDP — Sesi D P0-2)
--   - telegram_bot_token (sensitive — Phase 2.5 #11; was BROKEN before, now actually enforced)
--   - bundle_versions, bundle_update_policy (admin-managed; no landing-page use)
--   - phase_5_enabled, phase_6_enabled (admin-managed)
--   - monthly_llm_budget_cents (admin-managed)
GRANT SELECT (
  id,
  display_name,
  telegram_chat_id,
  telegram_bot_username,
  telegram_allowed_user_ids,
  pairing_code,
  pairing_code_expires_at,
  created_at
) ON public.customers TO anon, authenticated;

COMMENT ON COLUMN public.customers.soul_md_text IS
  'Sesi D P0-2 lock 2026-05-11: NOT in anon/authenticated SELECT allowlist (PII — full persona contract, ~10kB strategic narrative). Read only via service-role Edge Functions.';
COMMENT ON COLUMN public.customers.email IS
  'Sesi D P0-2 lock 2026-05-11: NOT in anon/authenticated SELECT allowlist (PII per UU PDP). Customer re-fills via checkout/onboarding form input on each session.';
COMMENT ON COLUMN public.customers.whatsapp_number IS
  'Sesi D P0-2 lock 2026-05-11: NOT in anon/authenticated SELECT allowlist (PII per UU PDP). Cached client-side via localStorage onboarding_wa_<cid> so refresh works without re-fetch.';
COMMENT ON COLUMN public.customers.telegram_bot_token IS
  'Phase 2.5 #11 + Sesi D P0-2: NOT in anon/authenticated SELECT allowlist. Encrypted via pgcrypto in supabase/migrations/20260509200000. Plaintext only via decrypt_bot_token() RPC called by service-role.';
