#!/usr/bin/env bash
# Rotate Xendit from TEST to PRODUCTION — run the moment the Individual
# (perorangan) account is approved. Usage:
#
#   XENDIT_PROD_KEY='xnd_production_...' XENDIT_PROD_WEBHOOK_TOKEN='...' \
#     bash scripts/rotate-xendit-prod.sh
#
# Then IMMEDIATELY do one real payment (cheapest: Bare Agent ≈ Rp 199rb, pay
# it yourself) and watch the chain within the 15-minute flow window — the
# first prod payment is ALSO the prod webhook-signature validation (test-mode
# shape was never verified byte-for-byte; see CLAUDE.md deferred gate).
set -euo pipefail

REF="gtjgsligllbjcisiyrah"

[[ "${XENDIT_PROD_KEY:-}" == xnd_production_* ]] \
  || { echo "ERROR: XENDIT_PROD_KEY must start with xnd_production_"; exit 1; }
[[ -n "${XENDIT_PROD_WEBHOOK_TOKEN:-}" ]] \
  || { echo "ERROR: XENDIT_PROD_WEBHOOK_TOKEN is required (Dashboard > Settings > Webhooks, LIVE mode)"; exit 1; }

echo "1/4 setting secrets (values not echoed)…"
supabase secrets set "XENDIT_API_KEY=${XENDIT_PROD_KEY}" "XENDIT_WEBHOOK_TOKEN=${XENDIT_PROD_WEBHOOK_TOKEN}" --project-ref "$REF"

echo "2/4 redeploying the two functions that read them…"
supabase functions deploy create-invoice --project-ref "$REF"
supabase functions deploy xendit-webhook --project-ref "$REF"

echo "3/4 sanity: create one invoice and confirm it is NOT the staging host…"
ANON=$(supabase projects api-keys --project-ref "$REF" -o json \
  | python3 -c "import json,sys; print(next(k.get('api_key') or k.get('apiKey','') for k in json.load(sys.stdin) if k.get('name')=='anon'))")
NOW=$(python3 -c "import datetime; print(datetime.datetime.now(datetime.timezone.utc).isoformat().replace('+00:00','Z'))")
URL=$(curl -s -X POST "https://${REF}.supabase.co/functions/v1/create-invoice" \
  -H "authorization: Bearer ${ANON}" -H 'content-type: application/json' \
  -d "{\"email\":\"rotation-check-$(date +%s)@weuseai.test\",\"plan\":\"bare\",\"alwaysOn\":false,\"methodId\":\"qris\",\"country\":\"Indonesia\",\"postal\":\"\",\"tos_accepted_at\":\"${NOW}\",\"marketing_opt_in_at\":null,\"policy_version\":\"v1.0\"}" \
  | python3 -c "import json,sys; print(json.load(sys.stdin).get('invoice_url',''))")
echo "   invoice_url: ${URL}"
case "$URL" in
  *checkout-staging.xendit.co*) echo "   ERROR: still STAGING/test mode — rotation did not take"; exit 1 ;;
  https://*) echo "   OK: production invoice host." ;;
  *) echo "   ERROR: no invoice_url returned"; exit 1 ;;
esac

echo "4/4 done. NOW: (a) confirm the LIVE-mode invoices callback in the Xendit"
echo "dashboard points to https://${REF}.supabase.co/functions/v1/xendit-webhook,"
echo "(b) make one real payment (Bare Agent) and watch: invoice paid -> webhook"
echo "-> subscription active -> VPS spin-up -> Telegram greeting, within 15 min."
