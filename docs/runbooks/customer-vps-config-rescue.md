# Customer VPS config rescue — runbook

> Use when a customer's Hermes agent isn't responding on Telegram
> after onboarding completes. Most common cause: stale .env on the
> VPS (per-customer bot token never reached the VPS due to the
> spinUp-idempotency bug closed in 2026-05-10 cascade).
>
> Track 4 of the agent-activation-gap cascade. See
> `docs/investigation/2026-05-10-agent-activation-gap.md` (Bug #3)
> and `docs/design/2026-05-10-vps-config-refresh.md` for context.

## Diagnose first

Before triggering rescue, verify the symptom matches:

```bash
# 1. Confirm customer state — should have telegram_chat_id +
#    telegram_bot_username + active subscription.
set -a && source .env.local && set +a
curl -s "$SUPABASE_URL/rest/v1/customers?id=eq.<CID>&select=id,display_name,telegram_chat_id,telegram_bot_username" \
  -H "apikey: $SUPABASE_SECRET_KEY" \
  -H "authorization: Bearer $SUPABASE_SECRET_KEY"

# 2. Confirm VPS exists — should have status=running + ip_address.
curl -s "$SUPABASE_URL/rest/v1/vps_instances?customer_id=eq.<CID>&select=*" \
  -H "apikey: $SUPABASE_SECRET_KEY" \
  -H "authorization: Bearer $SUPABASE_SECRET_KEY"

# 3. Customer reports: bot replies with REPLY_ALREADY_PAIRED to all
#    messages, OR bot is silent. Either symptom matches stale-env.
```

If all three checks pass: customer paid, paired, has VPS, but Hermes
isn't routing. Proceed to rescue.

## Path 1 — happy rescue (post-2E-3 customers)

For customers whose VPS was created **after 2026-05-08** (when fleet
SSH key bootstrap landed in the setup-script), the rescue is a single
admin curl.

```bash
set -a && source .env.local && set +a

# SUPABASE_SERVICE_ROLE_KEY is the JWT-format service-role bearer
# (NOT SUPABASE_SECRET_KEY — that's the legacy sb_secret_* form
# which the Edge Function gateway rejects with INVALID_JWT_FORMAT
# when verify_jwt=true).
curl -s -X POST \
  "$SUPABASE_URL/functions/v1/admin-customer-vps-refresh" \
  -H "authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "content-type: application/json" \
  -d "$(cat <<EOF
{
  "customer_id": "<CID>",
  "reason": "Stale .env diagnosis 2026-05-XX — bot not responding"
}
EOF
)" | python3 -m json.tool
```

**Expected on success:**

```json
{
  "ok": true,
  "customer_id": "<CID>",
  "vps_id": "<vps-uuid>",
  "ip_address": "27.x.x.x",
  "applied": { "TELEGRAM_BOT_TOKEN": "updated" },
  "hermes_restart_at": "2026-05-XXTHH:MM:SSZ",
  "request_id": "<uuid>"
}
```

After success, ask the customer to send `/start` to their bot.
Hermes should respond within ~30 seconds (long-poll cadence).

## Path 2 — pre-2E-3 customer (no fleet SSH pubkey)

If Path 1 returns **`502 ssh_auth_failed`** with detail like
`Permission denied (publickey,password)`, the customer's VPS was
created before 2026-05-08 and doesn't have the fleet SSH pubkey
in `/home/weuseai/.ssh/authorized_keys`. One-time founder action
required.

### What you need

- Customer's VPS IP (from the diagnose step above).
- The original SSH password from the IDCloudHost dashboard:
  - Log in to https://my.idcloudhost.com
  - Find the VPS named `liren-<first-8-of-cid>-<6-digits>`
  - Click → tab "Access" → reveal initial root password.
- Fleet pubkey from Fly secrets:
  ```bash
  flyctl ssh console --app weuseai-provisioning \
    -C 'cat /tmp/fleet-pubkey.txt 2>/dev/null || echo "$FLEET_SSH_PUBKEY"'
  ```
  Or read the pubkey from the local file `services/provisioning/fleet-pubkey.txt`
  if maintained. (As of 2026-05-10 the canonical source is the Fly
  secret `FLEET_SSH_PUBKEY`.)

### Steps

```bash
# 1. SSH in with the IDCH root password (sshpass or interactive).
ssh root@<VPS_IP>     # paste password when prompted

# 2. Switch to the weuseai user.
su - weuseai

# 3. Append the fleet pubkey.
mkdir -p ~/.ssh
chmod 700 ~/.ssh
echo "<FLEET_SSH_PUBKEY>" >> ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys

# 4. Verify (should print the pubkey on the last line).
tail -1 ~/.ssh/authorized_keys

# 5. Exit. Test fleet key works:
exit; exit
```

Now retry Path 1. The rescue endpoint should return `ok: true`.

### After rescue

```bash
# Verify Hermes is actually polling.
flyctl ssh console --app weuseai-provisioning -C \
  "ssh -i /etc/fleet-key.pem -o StrictHostKeyChecking=no \
   weuseai@<VPS_IP> 'systemctl is-active hermes-gateway && \
   journalctl -u hermes-gateway --since=\"5 minutes ago\" | tail -20'"
```

Look for log lines mentioning Telegram getUpdates with the new bot
token. If the service is `active` but no Telegram lines, manually
restart once more from inside (`sudo systemctl restart hermes-gateway`).

## Path 3 — repeat rescue / idempotency check

The `/refresh-env` route on the provisioning service has 10-min
request_id TTL idempotency. Re-firing the rescue with the same
request_id within 10 min returns the cached outcome. Different
request_id (which the admin Edge Function generates fresh each
call) triggers a new SSH.

To verify idempotency on a known-good customer (no SSH cost):

```bash
# Two calls in quick succession. First takes ~5s (real SSH).
# Second returns the same result instantly from refresh_env_requests
# cache via the provisioning service.
for i in 1 2; do
  echo "--- call $i ---"
  time curl -s -X POST "$SUPABASE_URL/functions/v1/admin-customer-vps-refresh" \
    -H "authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
    -H "content-type: application/json" \
    -d '{"customer_id":"<CID>","reason":"idempotency check"}'
done
```

Note: the admin function generates a fresh request_id per call, so
admin-side calls do NOT share the cache. Cache is for callers that
explicitly pass the same request_id (e.g.
complete-onboarding-handler retrying after a transient failure).

## Customer-facing fallback (when rescue fails)

If both Path 1 and Path 2 fail:

1. **Tear down + re-provision.** Resets to Phase-2E-3+ codepath:
   ```bash
   curl -X POST "https://weuseai-provisioning.fly.dev/tear-down" \
     -H "authorization: Bearer $PROVISIONING_AUTH_TOKEN" \
     -H "content-type: application/json" \
     -d '{"customerId":"<CID>"}'
   # Then ask customer to re-trigger spin-up via xendit-webhook
   # (re-pay the same invoice — refunded after).
   ```
2. **Manual one-shot script** if tear-down isn't an option (e.g.
   customer has accumulated state on the VPS):
   ```bash
   # SSH in as weuseai, manually update .env + restart.
   ssh -i ~/.ssh/fleet weuseai@<VPS_IP>
   sed -i "s|^TELEGRAM_BOT_TOKEN=.*|TELEGRAM_BOT_TOKEN=<new-token>|" \
     /home/weuseai/.hermes/.env
   sudo systemctl restart hermes-gateway
   ```

## Audit trail

Every admin rescue call is logged to:
- Edge Function logs:
  `https://supabase.com/dashboard/project/gtjgsligllbjcisiyrah/functions/admin-customer-vps-refresh/logs`
  Search for `[admin-customer-vps-refresh] cid=<CID>`.
- `refresh_env_requests` DB table (one row per request_id):
  ```bash
  curl -s "$SUPABASE_URL/rest/v1/refresh_env_requests?customer_id=eq.<CID>&select=*&order=started_at.desc&limit=10" \
    -H "apikey: $SUPABASE_SECRET_KEY" \
    -H "authorization: Bearer $SUPABASE_SECRET_KEY" | python3 -m json.tool
  ```

Once the third admin function lands needing audit, consolidate to a
shared `admin_audit_log` per
`docs/triggers/admin-audit-consolidation.md`.

## Status (as of 2026-05-10)

- ✅ `/refresh-env` route live on `weuseai-provisioning.fly.dev`
- ✅ `admin-customer-vps-refresh` Edge Function deployed
- ✅ `complete-onboarding` step 8a auto-calls refresh on every step 4
- ✅ Customer e282ce25 fixture preserved for cascade testing — rescue
  path verified end-to-end up to SSH (which fails because their VPS
  is pre-2E-3 and lacks fleet pubkey; founder one-time action needed
  per Path 2 above).
