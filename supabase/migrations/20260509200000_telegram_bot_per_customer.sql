-- Pair-flow Option A: per-customer Telegram bot.
--
-- Spec: docs/bugs/2026-05-09-pair-flow-investigation.md (the RCA + fix-path
-- analysis) + the architecture diagram in the PR description.
--
-- What ships in this migration:
--   1. pgcrypto extension (encrypted-at-rest bot tokens).
--   2. customers.telegram_bot_username (plaintext, for display + deeplink).
--   3. encrypt_bot_token() + decrypt_bot_token() helper functions.
--      Both read the encryption key from `current_setting('app.bot_token_enc_key')`
--      which must be set on the database BEFORE the migration is applied:
--          ALTER DATABASE postgres SET app.bot_token_enc_key = '<32+ char base64>';
--      Generate the key once: `openssl rand -base64 32`.
--   4. REVOKE SELECT on customers.telegram_bot_token FROM anon
--      (defense-in-depth — onboarding page already only selects safe columns,
--       but column-level revoke prevents accidental SELECT * leaks).
--   5. Index on customers.telegram_bot_username for the rare lookup case.
--
-- Phase 5+ migration path (documented for compliance audit, NOT shipped now):
--   pgcrypto's symmetric encryption is sufficient for ≤50 customers but
--   long-term we should migrate to Supabase Vault for managed KMS. Migration
--   path: dump-decrypt-via-helpers, re-encrypt via Vault, drop helpers, drop
--   column-level revoke (Vault handles access).

create extension if not exists pgcrypto;

-- New column: customer's bot username (e.g. 'andyfounderbot').
-- Plaintext — used for tg://resolve?domain=<username> deeplinks on the
-- onboarding page Step 3.
alter table customers
  add column if not exists telegram_bot_username text;

-- Helper: encrypt a bot token using the GUC key.
-- Returns base64-encoded ciphertext (text) so the existing
-- customers.telegram_bot_token column (already text) can hold it without
-- a type change.
create or replace function encrypt_bot_token(plaintext text)
returns text
language plpgsql
security definer
as $$
declare
  key text;
begin
  if plaintext is null then
    return null;
  end if;
  key := current_setting('app.bot_token_enc_key', true);
  if key is null or length(key) < 32 then
    raise exception
      'app.bot_token_enc_key not configured. Run: ALTER DATABASE postgres SET app.bot_token_enc_key = ''<32+ char base64>'';';
  end if;
  -- pgp_sym_encrypt returns bytea; encode as base64 for text storage.
  return encode(pgp_sym_encrypt(plaintext, key), 'base64');
end;
$$;

-- Helper: decrypt. Used by the provisioning service when writing the
-- token to a customer's VPS .env file. Edge Functions use service-role
-- so they can call this; anon role cannot (the function is SECURITY
-- DEFINER but the column-level REVOKE below blocks the column read,
-- which is what anon would attempt).
create or replace function decrypt_bot_token(ciphertext text)
returns text
language plpgsql
security definer
as $$
declare
  key text;
begin
  if ciphertext is null then
    return null;
  end if;
  key := current_setting('app.bot_token_enc_key', true);
  if key is null or length(key) < 32 then
    raise exception
      'app.bot_token_enc_key not configured. Run: ALTER DATABASE postgres SET app.bot_token_enc_key = ''<32+ char base64>'';';
  end if;
  return pgp_sym_decrypt(decode(ciphertext, 'base64'), key);
end;
$$;

-- Defense-in-depth: anon role has SELECT * on customers via the existing
-- "anon can read own customer onboarding state" policy. Revoke
-- column-level access to telegram_bot_token specifically — onboarding.html
-- already explicit-selects only the safe column set, but a future bug
-- that changes to SELECT * would leak ciphertext. With the REVOKE,
-- SELECT * fails for anon; explicit SELECTs of allowed columns continue
-- to work.
revoke select (telegram_bot_token) on customers from anon;

-- Speed up the rare lookup-by-username case (debug, support).
create index if not exists customers_telegram_bot_username_idx
  on customers(telegram_bot_username)
  where telegram_bot_username is not null;

-- Idempotency check: if pairing_code_expires_at didn't ship in
-- 20260506000000_onboarding.sql for some reason, ensure it exists.
alter table customers
  add column if not exists pairing_code_expires_at timestamptz;
