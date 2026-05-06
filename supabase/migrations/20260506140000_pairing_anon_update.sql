-- Onboarding page: column-level anon UPDATE for pairing rotation.
--
-- Spec: docs/plans/2026-05-06-onboarding-page-spec.md (section
-- "Pairing code generator" — runs in the page itself, not an Edge
-- Function, to save a round-trip).
--
-- Without this grant the PATCH /rest/v1/customers from anon returns
-- 403; the SELECT policy from migration 20260506000000_onboarding.sql
-- only permits reads.
--
-- Phase 1 risk profile:
--   - Anon UPDATE is scoped at the COLUMN level — only pairing_code +
--     pairing_code_expires_at can be written by anon. Attempts to PATCH
--     other columns (display_name, telegram_chat_id, etc.) return 403.
--   - The accompanying RLS policy below uses USING (true) WITH CHECK (true).
--     "Anyone with the cid UUID" can rotate that customer's pairing code.
--     UUIDs are unguessable so worst case is invalidating a code that's
--     already invalid — no escalation, no PII exposed.
--   - Phase 2B replaces the cid UUID with a short-lived signed JWT, which
--     scopes writes to the JWT bearer (same plan as welcome.html).
--
-- Defense in depth elsewhere:
--   - The customers.pairing_code unique partial index (in the previous
--     migration) prevents two customers ending up with the same active
--     code; a collision causes the UPDATE to fail loudly, the page
--     retries with a fresh random code.
--   - The /pair handler (telegram-bot-webhook) runs with service-role
--     privilege and ALSO checks pairing_code_expires_at > now() — so
--     a code that an attacker tried to "set" on someone else's row
--     still has to be DM'd to @weuseaibot from the right Telegram
--     account before expiry, which is the actual auth boundary.

grant update (pairing_code, pairing_code_expires_at) on customers to anon;

create policy "anon can rotate own pairing code"
  on customers for update
  to anon
  using (true)
  with check (true);
