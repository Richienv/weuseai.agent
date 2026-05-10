# VPS config refresh — design (2026-05-10)

> Track 0 of the agent-activation-gap fix cascade. Founder-approved
> 2026-05-10 with all 4 defaults locked.
>
> **Pivot 2026-05-10 during 3a implementation**: provisioning service
> is now a "dumb pipe" that takes caller-supplied `env_values` rather
> than decrypting bot tokens server-side. Reasoning: `BOT_TOKEN_ENC_KEY`
> is a Supabase Edge Function secret and isn't on Fly. Rather than
> copy the encryption key to a second secret store, callers (which
> already have the decrypted values in scope) pass them in. This is
> strictly safer (key in one place) and architecturally cleaner.
> Tracked inline at `services/provisioning/src/routes/refresh-env.ts`
> RefreshEnvRequest docstring.
>
> Context: `docs/investigation/2026-05-10-agent-activation-gap.md`
> (Bug #3 — VPS .env stale because `provisioning.spinUp` is
> idempotent on VPS existence, not on env state).

## Goal

A new `POST /refresh-env` endpoint on `services/provisioning` that
SSH-updates a customer's existing VPS `.env`, restarts Hermes,
verifies the restart took. Plus a Supabase admin Edge Function
(`admin-customer-vps-refresh`) that triggers it on demand for
manual customer rescue.

## Where it lives

```
services/provisioning/
├── src/
│   ├── routes/
│   │   ├── tier-bump.ts          (existing — pattern reference)
│   │   └── refresh-env.ts        (NEW)
│   ├── ssh-env-writer.ts         (NEW — pure helper, atomic .env write)
│   ├── customer-flow.ts          (TOUCH — no behaviour change here;
│   │                              refresh is its own flow)
│   └── index.ts                  (TOUCH — route registration only)

supabase/functions/
├── admin-customer-vps-refresh/   (NEW — admin-bearer gated)
│   └── index.ts
└── _shared/
    ├── admin-customer-vps-refresh-handler.ts   (NEW pure handler)
    └── onboarding-provisioning-client.ts       (TOUCH — add refreshEnv())

supabase/functions/_shared/
└── complete-onboarding-handler.ts              (TOUCH — call refreshEnv
                                                  after spinUp returns,
                                                  whether new or existing)
```

The new route is intentionally narrow — only updates a known set of
env keys. Not a generic "exec arbitrary script" path.

## Auth model

Two callers, two posture tiers:

| Caller | Auth | Why |
|---|---|---|
| `complete-onboarding-handler` (Supabase Edge Fn) | `Authorization: Bearer ${PROVISIONING_AUTH_TOKEN}` (existing service-role bearer) | Already trusted by `tier-bump`; same secret. |
| `admin-customer-vps-refresh` (Supabase Edge Fn) | service-role bearer at the FUNCTION layer (admin-auth check via `_shared/admin-auth.ts` JWT-role pattern) → then calls provisioning with the same `PROVISIONING_AUTH_TOKEN` | Admin UI / CLI / founder-only. The function-level admin gate is what stops random anon callers; the bearer token to provisioning is shared with system-level callers. |

No anon path. The browser-callable UI flows do NOT directly hit
`/refresh-env` — they go through `complete-onboarding-handler` (which
auto-triggers refresh as part of step 8) or admin tooling.

## Wire shape

### `POST /refresh-env`

```ts
// Request
{
  customer_id: string,           // UUID
  // Optional explicit set of keys to update. If omitted, refresh ALL
  // env keys we know how to source (currently: TELEGRAM_BOT_TOKEN).
  // Future-proofing for DEEPSEEK_API_KEY etc when we add per-customer
  // LLM keys (not yet wired).
  env_keys?: ReadonlyArray<'TELEGRAM_BOT_TOKEN'>,
  // Idempotency / replay protection — caller-supplied UUID. If the
  // same id is replayed within ~10 min, server returns the cached
  // result (200 with original outcome) instead of re-running.
  request_id?: string,
}

// Response
{
  ok: true,
  vps_id: string,
  ip_address: string,
  // What changed (per env key):
  applied: { [key: string]: 'updated' | 'unchanged' },
  // Restart attestation:
  hermes_restart_at: string,           // ISO
  hermes_active_after_restart: boolean,
  request_id: string,
}
| {
  ok: false,
  error:
    | 'no_active_vps'
    | 'ssh_unreachable'
    | 'ssh_auth_failed'
    | 'env_write_failed'
    | 'systemd_restart_failed'
    | 'hermes_inactive_after_restart'
    | 'internal',
  detail?: string,
  partial?: {
    env_written?: boolean,
    systemd_restarted?: boolean,
  },
}
```

`env_keys` defaults to `['TELEGRAM_BOT_TOKEN']` for now. The route
sources values from the customers row (decrypts bot token via
`decrypt_bot_token` RPC). A future LLM-key column would extend the
allowlist; new keys must be added explicitly to keep the surface
small.

### `admin-customer-vps-refresh`

```ts
// Request
{
  customer_id: string,
  reason?: string,    // Free-text for audit trail
}

// Response
{
  ok: true,
  applied: { [key: string]: 'updated' | 'unchanged' },
  hermes_active_after_restart: boolean,
}
| {
  ok: false,
  error: string,
  detail?: string,
}
```

Logs every call to a new `admin_audit_log` row (or extends an
existing audit table — see "Open question" below) with the admin's
identity, customer_id, reason, outcome.

## SSH helper pattern

**Reuse the `tier-bump.ts` shape**, do NOT touch `ssh-provisioner.ts`
(that interface is for one-shot full-script provisioning at create
time; updating one env line is a different shape).

Pattern: spawn `ssh` directly with `-i <fleet-key-tmpfile>`, run a
single `bash -c '<command>'` payload. The command is server-built
and includes:

1. `set -euo pipefail` — fail loud
2. Atomic env rewrite via `awk` + temp file + `mv`:
   ```bash
   awk -v key="TELEGRAM_BOT_TOKEN" -v val="$NEW_VAL" '
     BEGIN { found=0 }
     $0 ~ "^"key"=" { print key"="val; found=1; next }
     { print }
     END { if (!found) print key"="val }
   ' /home/weuseai/.hermes/.env > /tmp/.env.refresh && \
   mv /tmp/.env.refresh /home/weuseai/.hermes/.env && \
   chown weuseai:weuseai /home/weuseai/.hermes/.env && \
   chmod 600 /home/weuseai/.hermes/.env
   ```
   Writes a tmpfile + atomic `mv` so a partial write can never
   leave .env corrupted.
3. `systemctl restart hermes-gateway` — restarts the long-poller.
4. `sleep 2 && systemctl is-active hermes-gateway` — assert the
   service came back up. If not active, the SSH command exits non-zero.

The helper extracts the new `bash` command building into
`ssh-env-writer.ts` so it's unit-testable (pure string builder)
without invoking SSH.

## Idempotency strategy

Two layers:

1. **Server-side dedup** via `request_id`. New table
   `refresh_env_requests` (or repurpose an existing audit table —
   see Open Q):
   ```sql
   CREATE TABLE refresh_env_requests (
     request_id    uuid PRIMARY KEY,
     customer_id   uuid NOT NULL,
     started_at    timestamptz NOT NULL DEFAULT now(),
     completed_at  timestamptz,
     outcome       jsonb,                  -- the response body
     CONSTRAINT refresh_env_requests_recent
       UNIQUE (customer_id, request_id)
   );
   ```
   On call: check if `request_id` exists AND `completed_at` is
   within 10 min. If so, return cached `outcome`. Otherwise insert
   with `started_at=now()` and run.

2. **Inherent idempotency on env state**: the awk script above
   replaces the line if present, appends if not. Repeated calls
   with the same value are no-ops on disk content. Hermes restart
   is the cost; if the value is unchanged we'd skip the restart
   (read .env first, compare; only restart if changed).

The endpoint MUST be safe to retry from anywhere — Edge Function
retry, admin double-click, founder accidental re-fire.

## Failure modes

| Failure | Detection | Recovery |
|---|---|---|
| `vps_instances` row missing for customer | DB query returns null | Return `404 no_active_vps`. Caller (admin) probably needs to spin up first. |
| VPS unreachable (network / IP changed) | SSH `connect() ETIMEDOUT` | Return `503 ssh_unreachable` after 1 retry. Surface to admin; founder may need to check IDCloudHost dashboard. |
| Fleet SSH key rejected | SSH exits with auth failure code | Return `502 ssh_auth_failed`. Indicates pre-2E-3 customer (no fleet pubkey). One-time founder action: SSH manually with original creds, append fleet pubkey, retry. Documented in runbook. |
| `.env` write fails (disk full, perms) | Bash command exits non-zero before `mv` | Return `500 env_write_failed`, `partial.env_written=false`. .env stays as it was (tmpfile orphaned, gets cleaned by tmpwatch). |
| Atomic mv fails | Bash command exits between write and mv | Return `500 env_write_failed`, `partial.env_written=false`. .env unchanged (mv is atomic on same filesystem). |
| `systemctl restart` fails | Bash exits non-zero on restart | Return `500 systemd_restart_failed`, `partial.env_written=true`. .env now has new value but service didn't restart. Manual SSH to debug. |
| Hermes restarted but service-state is `failed` (Telegram conflict, bad token, etc.) | `systemctl is-active` returns `failed` | Return `500 hermes_inactive_after_restart`, `partial.env_written=true`, `partial.systemd_restarted=true`. Surface upstream; admin can check journalctl. |

All non-terminal failures are returned with enough `partial` info
that the caller can decide whether to alert + retry vs. tear-down +
re-spin.

## Wire-in points

### `complete-onboarding-handler` step 8

Currently:
```ts
const spinResult = await deps.provisioning.spinUp({...})
if (!spinResult.ok) { /* rollback */ }
// Step 8b: safeDeleteWebhook (Bug #2 — fixed in Track 2)
// Step 9: flip subscription active
```

Becomes:
```ts
const spinResult = await deps.provisioning.spinUp({...})
if (!spinResult.ok) { /* rollback */ }

// NEW step 8a: refresh env on the (possibly-existing) VPS so the
// customer's current bot token is what Hermes polls. spinUp's
// idempotency check returns existing VPS without updating .env;
// this closes that gap.
const refreshResult = await deps.provisioning.refreshEnv({
  customerId: customer_id,
  envKeys: ['TELEGRAM_BOT_TOKEN'],
  requestId: crypto.randomUUID(),
})
if (!refreshResult.ok) {
  // Park subscription, alert founder. Don't roll back the LLM key
  // (it's already minted on a working OpenRouter account); the env
  // refresh can be retried by admin-customer-vps-refresh later.
  await safeUpdateSubscription(deps.db, subscription.id, {
    status: 'pending_provision',
    hosting_active: false,
  })
  return json(
    { error: 'vps_refresh_failed', detail: refreshResult.error },
    503,
  )
}

// Step 8b: properDeleteWebhook (Track 2)
// ...
```

### `admin-customer-vps-refresh`

Standalone Edge Function. Admin auth → call `provisioning.refreshEnv`
→ write to audit table → return outcome.

## Test strategy

Three layers, mirroring what `tier-bump` already does:

1. **Pure handler tests** (`refresh-env-route.spec.ts`) — pass mock
   `runSsh` impl that records arguments + returns canned responses.
   Cover: happy path, ssh-unreachable, auth-fail, env-write-fail,
   systemd-restart-fail, hermes-inactive, idempotency replay.
2. **Pure helper tests** (`ssh-env-writer.spec.ts`) — string-building
   for the awk command. Asserts proper escaping of bot tokens
   containing `:` and `/` and `$`.
3. **Live test** (opt-in) — if Sesi A can spin a sandbox VPS in the
   IDCH test account, run the route against it. Otherwise skip.

Existing edge-fn-verify-jwt-config.spec.ts will need:
- `admin-customer-vps-refresh` in the JWT-required (admin) callable
  list. Per the existing JWT-role pattern, admin-bearer functions
  DO send Authorization, so verify_jwt can stay default (true).
  Check what other admin functions in config.toml do.

## Open questions for founder review

1. **Audit table reuse vs new table.** There's already
   `customer_persona_audit`. Does it fit `refresh_env_requests`
   semantically, or do we want a fresh table?
2. **Admin-side audit detail.** Admin functions exist
   (`pdf-render`, `customer-tier-bump`). Is there a shared
   `admin_audit_log` already, or should we add one as part of
   this work?
3. **Auto-trigger on every step 4 vs only on existing-VPS.** I
   recommend always-call (idempotent on disk content, cheap) for
   simplicity. Alternative: check `spinResult` for an "is_new" flag
   and only refresh on existing. Slightly faster on the new-VPS
   path; slightly more code.
4. **`request_id` cache TTL.** I picked 10 min. Open to longer
   (24h?) for stronger replay protection at the cost of table
   growth.

## Phasing

**Track 3a** (1 PR, ~6-8h): `/refresh-env` route + helper +
tests + `OnboardingProvisioningClient.refreshEnv()` method +
DB migration for `refresh_env_requests` table.

**Track 3b** (1 PR, ~3-4h): Wire into `complete-onboarding-handler`
step 8a + handler tests for the new path. Ships only after 3a is
deployed and live-verified.

**Track 3c** (1 PR, ~2-3h): `admin-customer-vps-refresh` Edge
Function + handler tests. Independent of 3b — could ship same
day as 3a if scope allows.

**Track 4** (manual, ~30 min): Run `admin-customer-vps-refresh`
for customer e282ce25, verify Hermes responds, write runbook.

Total estimate: 11-15 hours of work split across 3 PRs +
verification.

## Deferred / out of scope

- Re-running the full setup-script for "broken VPS" customers
  (different problem class — reinstalls Hermes from scratch).
  If `/refresh-env` reports `ssh_auth_failed` for a pre-2E-3
  customer, the runbook will say "tear-down + re-spin via
  /spin-up + manual data import" — not building a "rebuild VPS
  in place" path now.
- Multi-region awareness — current design assumes all VPS in
  jkt01. Phase 3 might add cyc01 etc.; the route should
  surface whatever IP is in vps_instances and not care about
  region.
- DeepSeek per-customer credit flow — separate question from
  bot-token refresh; not in this design.
