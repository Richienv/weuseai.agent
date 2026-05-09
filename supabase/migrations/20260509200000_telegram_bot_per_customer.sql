-- Pair-flow Option A: per-customer Telegram bot.
--
-- Spec: docs/bugs/2026-05-09-pair-flow-investigation.md (the RCA + fix-path
-- analysis) + the architecture diagram in PR #9.
--
-- ┌─────────────────────────────────────────────────────────────────────┐
-- │ POST-DEPLOY REWRITE 2026-05-09                                      │
-- │                                                                     │
-- │ This file was rewritten in-place AFTER PR #9 merged to match what   │
-- │ founder actually applied via Dashboard SQL Editor:                  │
-- │                                                                     │
-- │   * Helper functions take the encryption key as an RPC PARAMETER    │
-- │     (token+enc_key, encrypted+enc_key) — NOT from a Postgres GUC.   │
-- │   * No ALTER DATABASE step needed.                                  │
-- │   * Edge Functions read BOT_TOKEN_ENC_KEY from Supabase secrets and │
-- │     pass it on every RPC call.                                      │
-- │                                                                     │
-- │ Original v1 (GUC-based) was never applied to production. This v2    │
-- │ matches what's actually live. Fresh-database setups should run this │
-- │ file.                                                               │
-- └─────────────────────────────────────────────────────────────────────┘
--
-- What ships in this migration:
--   1. pgcrypto extension (encrypted-at-rest bot tokens).
--   2. customers.telegram_bot_username (plaintext, for display + deeplink).
--   3. encrypt_bot_token(token, enc_key) + decrypt_bot_token(encrypted, enc_key)
--      helper functions. Edge Function reads BOT_TOKEN_ENC_KEY from Supabase
--      secrets and passes via the enc_key param.
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

-- Helper: encrypt a bot token. Key passed as enc_key param (NOT from GUC).
-- Returns base64-encoded ciphertext (text) so the existing
-- customers.telegram_bot_token column (already text) can hold it without
-- a type change.
create or replace function public.encrypt_bot_token(token text, enc_key text)
returns text
language plpgsql
security definer
as $$
begin
  if token is null then
    return null;
  end if;
  if enc_key is null or length(enc_key) < 32 then
    raise exception
      'encrypt_bot_token: enc_key required (≥32 chars). Pass via Supabase secret BOT_TOKEN_ENC_KEY.';
  end if;
  -- pgp_sym_encrypt returns bytea; encode as base64 for text storage.
  return encode(pgp_sym_encrypt(token, enc_key), 'base64');
end;
$$;

-- Helper: decrypt. Edge Functions (service-role) call this with the same
-- enc_key. Anon cannot — the column-level REVOKE below blocks the
-- ciphertext read, which is the prerequisite for decryption.
create or replace function public.decrypt_bot_token(encrypted text, enc_key text)
returns text
language plpgsql
security definer
as $$
begin
  if encrypted is null then
    return null;
  end if;
  if enc_key is null or length(enc_key) < 32 then
    raise exception
      'decrypt_bot_token: enc_key required (≥32 chars). Pass via Supabase secret BOT_TOKEN_ENC_KEY.';
  end if;
  return pgp_sym_decrypt(decode(encrypted, 'base64'), enc_key);
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
