#!/usr/bin/env bash
# One-command deploy of everything that needs founder secrets (2026-06-11).
#
# The landing + admin + compressed videos deploy AUTOMATICALLY when main is
# pushed (Vercel, static). This script handles the backend that an
# autonomous session CANNOT reach (no secrets in the sandbox): Supabase
# migrations + Edge Functions, and the Fly provisioning service.
#
# Run it from a machine/CI that has the secrets below. It is idempotent and
# stops on the first error. Anything already deployed is a no-op.
#
# PREREQUISITES (install once):
#   - supabase CLI   (npm i -g supabase)   + `supabase login`
#   - flyctl         (https://fly.io/docs/flyctl/install)  + `fly auth login`
#   - env: SUPABASE_PROJECT_REF, SUPABASE_ACCESS_TOKEN (or interactive login)
#   - Supabase Function secrets (set once in dashboard or via CLI):
#       DEEPSEEK_API_KEY, SUPPORT_TELEGRAM_BOT_TOKEN, RICHIE_CHAT_ID,
#       PROVISIONING_URL, PROVISIONING_AUTH_TOKEN, BOT_TOKEN_ENC_KEY
set -euo pipefail
cd "$(dirname "$0")/.."

REF="${SUPABASE_PROJECT_REF:-gtjgsligllbjcisiyrah}"
echo "▶ Deploying to Supabase project: $REF"

# ── 1. Migrations (apply any not yet applied) ─────────────────────────
echo "── 1/4 Migrations"
supabase db push --project-ref "$REF"

# ── 2. Edge Functions (everything in supabase/functions/) ─────────────
echo "── 2/4 Edge Functions"
for fn in fleet-sentinel persona-genesis genesis-distill library-refine library-proposal-apply \
          bundle-fetch create-invoice complete-onboarding xendit-webhook \
          retry-pending-provisions customer-tier-bump restart-hermes; do
  if [ -d "supabase/functions/$fn" ]; then
    echo "   deploy $fn"
    supabase functions deploy "$fn" --project-ref "$REF"
  fi
done

# ── 3. pg_cron settings for the new scheduled functions ───────────────
# These tell pg_cron which URL+token to POST. Run once; re-running is safe.
cat <<'SQL'
── 3/4 Run this SQL ONCE in the Supabase SQL editor (replace <service-role-jwt>):
  ALTER DATABASE postgres SET app.fleet_sentinel_url   = 'https://gtjgsligllbjcisiyrah.supabase.co/functions/v1/fleet-sentinel';
  ALTER DATABASE postgres SET app.fleet_sentinel_token = '<service-role-jwt>';
  ALTER DATABASE postgres SET app.library_refine_url   = 'https://gtjgsligllbjcisiyrah.supabase.co/functions/v1/library-refine';
  ALTER DATABASE postgres SET app.library_refine_token = '<service-role-jwt>';
SQL

# ── 4. Fly provisioning service (ships /suspend /resume + bundle-pull v2) ─
echo "── 4/4 Fly provisioning service"
if [ -f services/provisioning/fly.toml ]; then
  ( cd services/provisioning && fly deploy )
else
  echo "   (services/provisioning/fly.toml not found — skip)"
fi

echo "✓ Backend deploy complete."
echo "  Recommended: set FLEET_SENTINEL_DRY_RUN=true on the fleet-sentinel"
echo "  function for the first day, then flip to false."
