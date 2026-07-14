-- Fix subscriptions_tier_check to allow the v1.4 canonical tier slugs.
--
-- The v1.4 tiers (bare / solo / voice-starter / library-full / done-for-you /
-- enterprise, locked 2026-06-09) were added to the catalog, landing, and checkout
-- but the DB CHECK constraint on subscriptions.tier still only allowed the legacy
-- ('starter','pro','studio') slugs. So every v1.4 checkout inserted a pending
-- subscription with e.g. tier='library-full', which the constraint REJECTED —
-- create-invoice threw on the insert and returned a raw 500. Result: ALL payments
-- have been silently broken since ~2026-06-09.
--
-- Allow the full v1.4 set PLUS the legacy aliases (still used by existing rows +
-- the aliased provisioning chain: starter→voice-starter, pro→done-for-you,
-- studio→library-full).
ALTER TABLE subscriptions DROP CONSTRAINT IF EXISTS subscriptions_tier_check;
ALTER TABLE subscriptions ADD CONSTRAINT subscriptions_tier_check
  CHECK (tier IN ('bare', 'solo', 'voice-starter', 'library-full', 'done-for-you', 'enterprise', 'starter', 'pro', 'studio'));
