# `BOT_TOKEN_ENC_KEY` rotation runbook

> Sesi D security audit P1-6 (2026-05-10). See
> `docs/audits/2026-05-10-security-audit-sesi-d.md` for the threat
> rationale.

## Background

Every customer's Telegram bot token is encrypted with a single shared
symmetric key, `BOT_TOKEN_ENC_KEY`, set as a Supabase Edge Function
secret. The key is consumed by:

- `supabase/functions/_shared/onboarding-store-supabase.ts` —
  passes `enc_key` into the pgcrypto helpers.
- `public.encrypt_bot_token(token, enc_key)` /
  `public.decrypt_bot_token(encrypted, enc_key)` — defined in
  `supabase/migrations/20260509200000_telegram_bot_per_customer.sql`.

Edge Functions that load the key:

- `validate-bot-token`
- `complete-onboarding`
- `pair-customer-bot-webhook`
- `approval-queue`

If the key is ever compromised (former operator with prior secret
access, env-var dump in logs, accidental commit, Supabase project
take-over), every customer's bot token is at risk. This runbook is the
manual recovery procedure.

## When to rotate

Rotate the key when **any** of these happen:

- Confirmed or suspected key leak (logs, screenshots, repo).
- Operator with prior secret access leaves the team.
- Annual rotation (target cadence; first paying customer onwards).
- Major incident response involving Supabase project credentials.

For routine paid-customer-zero state, rotation is a privacy hygiene
measure, not an emergency. Do not rotate during a live onboarding
window.

## Pre-rotation checklist

- [ ] No active onboarding session (`pairing_code IS NOT NULL`) in
      `customers`. Check via the admin dashboard or:
      ```sql
      SELECT count(*) FROM customers
      WHERE pairing_code IS NOT NULL
        AND pairing_code_expires_at > now();
      ```
- [ ] Founder is at a workstation with Supabase Management API access
      (not on mobile, not on a flight).
- [ ] Latest production logical backup exists (Supabase auto-snapshot
      within last 24h, or manual `pg_dump`).
- [ ] At least one Telegram-bot-equipped customer is reachable for
      post-rotation smoke-test (or use a test customer if no paying
      customers yet).

## Rotation procedure (single-key, downtime ≤2 min)

This is the **simple rotation** suitable until the rolling-key code
path lands (see "Future hardening" below). It briefly pauses the
Telegram-paired customer flow while we re-encrypt all rows.

### Step 1 — Generate the new key

```bash
# 32+ char base64 — safe via openssl, no internet round-trip
openssl rand -base64 48
```

Save the new value as `NEW_KEY` in your local terminal. Do not commit
it anywhere.

### Step 2 — Pause the affected Edge Functions

We pause to prevent a write concurrent with re-encryption from being
encrypted under the old key (which would then fail to decrypt under
the new key).

In the Supabase dashboard, set the four affected functions to
`paused`, OR ship a temporary deny-all middleware via
`supabase functions deploy`. Founder discretion — pausing in the
dashboard is fastest.

Time-box: pause should be ≤2 min total.

### Step 3 — Re-encrypt all rows server-side

Open the Supabase SQL editor (or run via `psql` against the pooler).
**The OLD and NEW keys both pass through the SQL session as session
variables — never embedded in a saved query.**

```sql
-- Set both keys as session variables (NOT persisted).
SET LOCAL custom.old_enc_key = '<OLD_KEY>';
SET LOCAL custom.new_enc_key = '<NEW_KEY>';

-- Decrypt with old, re-encrypt with new, in a single UPDATE.
UPDATE customers
SET telegram_bot_token = encrypt_bot_token(
  decrypt_bot_token(telegram_bot_token, current_setting('custom.old_enc_key')),
  current_setting('custom.new_enc_key')
)
WHERE telegram_bot_token IS NOT NULL;

-- Verify: decrypt one row using the NEW key. Should succeed.
SELECT decrypt_bot_token(telegram_bot_token, current_setting('custom.new_enc_key'))
FROM customers
WHERE telegram_bot_token IS NOT NULL
LIMIT 1;
```

If the verification SELECT succeeds (returns a real bot token starting
with digits + `:`), the re-encryption worked.

If the verification fails, **roll back**: re-run the UPDATE with old
and new swapped. Do NOT proceed to Step 4. Investigate the failure
before retrying.

### Step 4 — Update the Supabase secret

```bash
# Mac Mini control plane, GFW-safe via Mgmt API.
supabase secrets set BOT_TOKEN_ENC_KEY="<NEW_KEY>" \
  --project-ref gtjgsligllbjcisiyrah
```

Verify via the dashboard that the secret value changed.

### Step 5 — Redeploy the four affected Edge Functions

The functions read the secret at cold start. Re-deploying forces a
cold start under the new value:

```bash
supabase functions deploy \
  validate-bot-token \
  complete-onboarding \
  pair-customer-bot-webhook \
  approval-queue \
  --project-ref gtjgsligllbjcisiyrah \
  --use-api
```

### Step 6 — Resume the functions

Un-pause from the Supabase dashboard, or re-deploy without the
deny-all middleware.

### Step 7 — Smoke-test post-rotation

Use a known-paired customer (or test customer) and trigger an end-to-end
flow that exercises decryption:

- An approval-queue dispatch (writes a Telegram message via the
  customer's bot — requires successful `decrypt_bot_token`).
- Or: `pair-customer-bot-webhook` for a fresh test customer (also
  hits decryption when looking up the bot token).

Confirm the customer receives the Telegram message. If it fails
silently, check the Edge Function logs for `decrypt_bot_token` errors.

### Step 8 — Securely discard the old key

Delete `OLD_KEY` from any terminal scrollback, password manager
clipboard, etc. Do not retain it — once Step 7 verifies, the old key
serves no purpose and is liability only.

## Future hardening — rolling-key path

The single-key rotation above requires a brief pause + a re-encryption
sweep. A rolling-key path eliminates both:

1. Add a second secret `BOT_TOKEN_ENC_KEY_NEXT`.
2. Update `decrypt_bot_token` to accept a second parameter and try
   `enc_key` first, then `enc_key_next` on failure.
3. Update Edge Functions to load both secrets.
4. Rotation procedure becomes:
   - Set `BOT_TOKEN_ENC_KEY_NEXT = NEW_KEY` (deploy).
   - Background job re-encrypts rows from old to new at leisure.
   - Promote `NEXT` to primary, blank out `NEXT` (deploy).
   - No write pause needed.

This is **not yet implemented**. Tracked in `NEXT.md` as Phase 6
hardening; first paying customer onwards.

## Long-term — Supabase Vault migration

The pgcrypto helpers are sufficient for ≤50 customers. Beyond that,
managed KMS via Supabase Vault becomes the right move (audit log,
HSM-backed key, no shared symmetric key in app secrets).

Migration path is documented in
`supabase/migrations/20260509200000_telegram_bot_per_customer.sql`
header comment lines 34-38. Tracked in `NEXT.md` as Phase 6 hardening.

## Audit log

Log every rotation in `docs/audits/key-rotation-log.md` (create if
missing) with:

- Date/time (UTC).
- Trigger reason (leak / annual / personnel).
- Operator name.
- Pre-rotation customer count.
- Post-rotation smoke-test result.

Do NOT log key values — only the rotation event.
