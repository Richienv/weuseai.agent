# Smoke tests

Reusable scripts that exercise integrations end-to-end against real third-party services + the live Supabase project. NOT run in CI — these are manual founder-verification steps for pre-merge sanity checks.

## sesi-r-xendit-smoke.mjs

Sesi R Phase 8. Exercises the Xendit integration end-to-end without deploying any Edge Function:

1. Creates throwaway test customer
2. Stores Xendit sandbox key via `handleIntegrationCredential` POST
3. Validates against live Xendit sandbox (real `GET /balance` probe)
4. Calls `invoice.create` via `handleXenditProxy` → real Xendit sandbox
5. Verifies Bahasa error mapping fires for bogus call
6. Verifies `audit_log` rows written + PII sanitized (no api_key leak)
7. Revokes credential + confirms 410
8. Tears down test customer

### Required env (in `.env.local` OR exported)

```bash
SUPABASE_URL                # https://gtjgsligllbjcisiyrah.supabase.co
SUPABASE_SERVICE_ROLE_KEY   # service-role JWT (NOT the anon key)
HERMES_INSTANCE_HMAC_KEY    # already in .env.local (existing)
INTEGRATION_ENCRYPTION_KEY  # NEW — openssl rand -hex 32
XENDIT_SANDBOX_API_KEY      # xnd_development_... from Xendit dashboard
```

### Run

```bash
cd /Volumes/Extreme\ SSD/weuseai.agent/velorah
npx tsx scripts/smoke/sesi-r-xendit-smoke.mjs
```

Expected output: 9 green checks, exit 0. Any failure aborts with diagnostic.

### Cleanup

The script tears down its own test customer (DELETE rows from `customers` + `audit_log` + `integration_credentials`). If it crashes mid-flow, leftover rows have customer_id matching the `_sesi_r_smoke_*@weuseai-test.local` email pattern — clean manually via SQL.
